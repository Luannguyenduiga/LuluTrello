import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** What a stored object looks like to the rest of the app. */
export interface StoredObject {
  size: number;
  contentType?: string;
}

/** How long a link handed to a browser stays valid. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * Task attachments, kept in Cloudflare R2 rather than on the server's disk.
 *
 * The disk was never durable: Render's free tier throws the filesystem away
 * every time the service redeploys OR spins down after 15 idle minutes, so
 * uploads survived hours at best. R2 also removes the other problem the disk
 * had - files served from /uploads were readable by anyone holding the link,
 * with no board check - because nothing here is public: every URL this service
 * hands out is signed, expires, and is only ever minted after a guard has
 * already approved the request.
 *
 * With no R2 credentials configured the service reports itself disabled and
 * callers fall back to the local disk, so a dev machine still works unchanged.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucketName = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const endpoint = this.endpoint();
    const bucket = this.config.get<string>('R2_BUCKET');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'R2 is not configured - attachments will be written to the local disk, ' +
          'which most hosts wipe on restart. Set R2_ENDPOINT (or R2_ACCOUNT_ID), ' +
          'R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.',
      );
      return;
    }

    this.bucketName = bucket;
    this.client = new S3Client({
      // R2 has no regions, but the SDK insists on one being set.
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.logger.log(`Attachments are stored in the R2 bucket "${bucket}".`);
  }

  /** False when nothing is configured; callers then use the local disk. */
  get enabled(): boolean {
    return this.client !== null;
  }

  get bucket(): string {
    return this.bucketName;
  }

  /**
   * The account endpoint, with any bucket path removed.
   *
   * Cloudflare's dashboard shows the S3 URL with the bucket appended, and that
   * is what tends to get pasted into the environment - but the SDK wants the
   * account endpoint alone and the bucket passed separately, so a pasted
   * ".../lulutrello" would otherwise sign requests for ".../lulutrello/lulutrello".
   */
  private endpoint(): string | undefined {
    const configured = this.config.get<string>('R2_ENDPOINT');
    if (configured) {
      const match = configured.trim().match(/^(https?:\/\/[^/]+)/i);
      return match ? match[1] : undefined;
    }

    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    return accountId ? `https://${accountId.trim()}.r2.cloudflarestorage.com` : undefined;
  }

  /** The object key an attachment is stored under. */
  key(taskId: string, fileId: string, extension: string): string {
    return `attachments/${taskId}/${fileId}${extension ? `.${extension}` : ''}`;
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<void> {
    await this.require().send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
      }),
    );
  }

  /** Size and type without downloading the bytes; null when the object is gone. */
  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.require().send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      return { size: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error: any) {
      // Anything but "not there" is a real fault worth seeing in the logs.
      if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') {
        this.logger.warn(`HEAD ${key} failed: ${error.message}`);
      }
      return null;
    }
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.require().send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
    );
    const body = result.Body as { transformToByteArray(): Promise<Uint8Array> } | undefined;
    if (!body) throw new Error('The object has no body');
    return Buffer.from(await body.transformToByteArray());
  }

  /**
   * A temporary direct link for the browser.
   *
   * `filename` names the file in the save dialog and, for 'attachment', is what
   * turns a click into a download rather than a tab the browser tries to render.
   */
  async signedUrl(
    key: string,
    filename: string,
    disposition: 'inline' | 'attachment' = 'inline',
  ): Promise<string> {
    return getSignedUrl(
      this.require(),
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ResponseContentDisposition: this.disposition(disposition, filename),
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  }

  async remove(key: string): Promise<void> {
    await this.require().send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
  }

  /**
   * A Content-Disposition value that survives Vietnamese file names.
   *
   * The quoted form is ASCII only, so it gets the accents stripped rather than
   * blanked out ("Bao cao.pdf", not "B_o c_o.pdf"), and the real name follows
   * in the RFC 5987 form that every current browser prefers.
   */
  private disposition(kind: 'inline' | 'attachment', name: string): string {
    const ascii =
      name
        .normalize('NFD')
        // Vietnamese tone marks decompose into combining accents; d-with-stroke
        // is a letter in its own right and has to be mapped by hand.
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'D')
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\]/g, '_')
        .trim() || 'file';
    // encodeURIComponent leaves behind a few characters RFC 5987 does not allow.
    const utf8 = encodeURIComponent(name).replace(
      /['()*!]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `${kind}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
  }

  private require(): S3Client {
    if (!this.client) {
      throw new Error('R2 storage is not configured on this server');
    }
    return this.client;
  }
}

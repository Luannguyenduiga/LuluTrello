import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export type DocumentData = Record<string, any> & { id: string };

/**
 * Firestore is the only supported backing store. There is deliberately no local
 * JSON fallback: a silent fallback made a misconfigured server look healthy
 * while every collection read came back empty.
 */
@Injectable()
export class FirestoreService implements OnModuleInit {
  private readonly logger = new Logger(FirestoreService.name);
  private firestore!: admin.firestore.Firestore;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const serviceAccountRaw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');

    if (!admin.apps.length) {
      if (serviceAccountRaw) {
        let serviceAccount: admin.ServiceAccount;
        try {
          serviceAccount = JSON.parse(serviceAccountRaw);
        } catch (error: any) {
          throw this.initError(`FIREBASE_SERVICE_ACCOUNT is not valid JSON (${error.message})`);
        }
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        this.logger.log('Firebase Admin SDK initialized with a service account.');
      } else if (projectId) {
        admin.initializeApp({ projectId });
        this.logger.log('Firebase Admin SDK initialized with a project id.');
      } else {
        throw this.initError('no Firebase credentials were provided');
      }
    }

    this.firestore = admin.firestore();
    // Firestore rejects undefined field values outright; treat them as "leave
    // unset" so a single missing optional field cannot turn a write into a 500.
    this.firestore.settings({ ignoreUndefinedProperties: true });
  }

  private initError(detail: string): Error {
    return new Error(
      `Firestore initialization failed: ${detail}\n` +
        'Set FIREBASE_SERVICE_ACCOUNT (minified service account JSON on a single line) ' +
        'or FIREBASE_PROJECT_ID in the .env file before starting the server.',
    );
  }

  private toItem(doc: admin.firestore.DocumentSnapshot): DocumentData {
    return { id: doc.id, ...(doc.data() as Record<string, any>) };
  }

  /** Find all items in a collection, optional in-memory filter */
  async find(
    collection: string,
    filterFn?: (item: DocumentData) => boolean,
  ): Promise<DocumentData[]> {
    const snapshot = await this.firestore.collection(collection).get();
    const list = snapshot.docs.map((doc) => this.toItem(doc));
    return filterFn ? list.filter(filterFn) : list;
  }

  /** Find a single item by predicate (e.g. by email) */
  async findOne(
    collection: string,
    filterFn: (item: DocumentData) => boolean,
  ): Promise<DocumentData | null> {
    const snapshot = await this.firestore.collection(collection).get();
    for (const doc of snapshot.docs) {
      const data = this.toItem(doc);
      if (filterFn(data)) return data;
    }
    return null;
  }

  /** Find a document by id */
  async findById(collection: string, id?: string): Promise<DocumentData | null> {
    if (!id) return null;
    const doc = await this.firestore.collection(collection).doc(id).get();
    if (!doc.exists) return null;
    return this.toItem(doc);
  }

  /** Insert a new document, generating an id when none is supplied */
  async insert(collection: string, data: Record<string, any>): Promise<DocumentData> {
    const id = data.id || this.generateId();
    const documentData = { ...data, id };
    await this.firestore.collection(collection).doc(id).set(documentData);
    return documentData as DocumentData;
  }

  /** Update an existing document and return its new state */
  async update(
    collection: string,
    id: string,
    updateData: Record<string, any>,
  ): Promise<DocumentData> {
    const docRef = this.firestore.collection(collection).doc(id);
    try {
      await docRef.update(updateData);
    } catch {
      throw new InternalServerErrorException(`Document ${id} not found in ${collection}`);
    }
    const updated = await docRef.get();
    return this.toItem(updated);
  }

  /** Delete a document */
  async delete(collection: string, id: string): Promise<boolean> {
    await this.firestore.collection(collection).doc(id).delete();
    return true;
  }

  generateId(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  shortId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

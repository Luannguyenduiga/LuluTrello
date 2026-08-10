import { Controller, Get, Logger, Param, UseGuards } from '@nestjs/common';
import axios from 'axios';
import { FirestoreService } from '../common/firestore/firestore.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller('repositories')
@UseGuards(JwtAuthGuard)
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(private readonly firestore: FirestoreService) {}

  @Get(':repositoryId/github-info')
  async getGithubInfo(
    @Param('repositoryId') rawRepositoryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    const repositoryId = decodeURIComponent(rawRepositoryId);

    const account = await this.firestore.findById('users', user.id);
    const githubToken: string | null = account?.githubToken ?? null;

    // Without a real token (or in mock mode) serve sample data so the UI is usable offline
    if (!githubToken || githubToken.startsWith('mock_')) {
      this.logger.log(`Mocking GitHub info for repository: ${repositoryId}`);
      return this.mockRepositoryInfo(repositoryId);
    }

    const config = {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    };
    const repoUrl = `https://api.github.com/repos/${repositoryId}`;

    const [branchesRes, pullsRes, issuesRes, commitsRes] = await Promise.allSettled([
      axios.get<any[]>(`${repoUrl}/branches`, config),
      axios.get<any[]>(`${repoUrl}/pulls?state=open`, config),
      axios.get<any[]>(`${repoUrl}/issues?state=open`, config),
      axios.get<any[]>(`${repoUrl}/commits?per_page=10`, config),
    ]);

    return {
      repositoryId,
      branches:
        branchesRes.status === 'fulfilled'
          ? branchesRes.value.data.map((b: any) => ({
              name: b.name,
              lastCommitSha: b.commit.sha,
            }))
          : [],
      pulls:
        pullsRes.status === 'fulfilled'
          ? pullsRes.value.data.map((p: any) => ({
              title: p.title,
              pullNumber: p.number.toString(),
            }))
          : [],
      // The issues endpoint returns pull requests too, so filter those out
      issues:
        issuesRes.status === 'fulfilled'
          ? issuesRes.value.data
              .filter((i: any) => !i.pull_request)
              .map((i: any) => ({ title: i.title, issueNumber: i.number.toString() }))
          : [],
      commits:
        commitsRes.status === 'fulfilled'
          ? commitsRes.value.data.map((c: any) => ({
              sha: c.sha.substring(0, 8),
              message: c.commit.message,
            }))
          : [],
    };
  }

  private mockRepositoryInfo(repositoryId: string) {
    return {
      repositoryId,
      branches: [
        { name: 'main', lastCommitSha: '7f9a2c3b5d8e1f0a3c2b1d0e9f8a7b6c5d4e3f2a' },
        {
          name: 'feature/drag-and-drop',
          lastCommitSha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
        },
        { name: 'bugfix/auth-leak', lastCommitSha: '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d' },
      ],
      pulls: [
        { title: 'feat: Add drag-and-drop support for tasks', pullNumber: '12' },
        { title: 'fix: Resolve JWT token expiration issue', pullNumber: '15' },
      ],
      issues: [
        { title: 'Task assignment dropdown does not load members', issueNumber: '42' },
        { title: 'Socket connection fails intermittently on Firefox', issueNumber: '45' },
        { title: 'Update dependencies to fix vulnerabilities', issueNumber: '48' },
      ],
      commits: [
        { sha: '7f9a2c3b', message: 'Merge pull request #12 from feature/drag-and-drop' },
        { sha: 'a1b2c3d4', message: 'feat: Implement HTML5 Drag and Drop board layout' },
        { sha: '9e8d7c6b', message: 'fix: Clear verification codes after signup/signin' },
        { sha: '8c7b6a5f', message: 'docs: Update README with deployment guides' },
      ],
    };
  }
}

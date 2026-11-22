import type { PrismaClient } from '@prisma/client';
import type { PersistentStore } from '../store.ts';
import { getActivePersistenceMode, getPrismaClient } from '../db/prisma.ts';
import {
  ClientRepository,
  OrganizationRepository,
  SubscriptionRepository,
  UserRepository,
} from './core.repositories.ts';
import {
  ContractRepository,
  CRMRepository,
  FinanceRepository,
  ProposalRepository,
} from './commercial-finance.repositories.ts';
import {
  AIRepository,
  CreativeRepository,
  IntegrationRepository,
  LandingPageRepository,
  ProjectRepository,
  TicketRepository,
  WorkflowRepository,
} from './operations.repositories.ts';

export * from './base.ts';
export * from './core.repositories.ts';
export * from './commercial-finance.repositories.ts';
export * from './operations.repositories.ts';

export interface NerRepositories {
  organizations: OrganizationRepository;
  users: UserRepository;
  clients: ClientRepository;
  finance: FinanceRepository;
  projects: ProjectRepository;
  crm: CRMRepository;
  proposals: ProposalRepository;
  contracts: ContractRepository;
  subscriptions: SubscriptionRepository;
  ai: AIRepository;
  tickets: TicketRepository;
  creatives: CreativeRepository;
  landingPages: LandingPageRepository;
  workflows: WorkflowRepository;
  integrations: IntegrationRepository;
}

export function createRepositories(params: {
  store: PersistentStore;
  prisma?: PrismaClient | null;
}): NerRepositories {
  let resolvedPrisma: PrismaClient | null = params.prisma ?? null;
  if (resolvedPrisma === null && params.prisma === undefined && getActivePersistenceMode() === 'postgres') {
    try {
      resolvedPrisma = getPrismaClient();
    } catch {
      resolvedPrisma = null;
    }
  }

  const deps = { store: params.store, prisma: resolvedPrisma };
  return {
    organizations: new OrganizationRepository(deps),
    users: new UserRepository(deps),
    clients: new ClientRepository(deps),
    finance: new FinanceRepository(deps),
    projects: new ProjectRepository(deps),
    crm: new CRMRepository(deps),
    proposals: new ProposalRepository(deps),
    contracts: new ContractRepository(deps),
    subscriptions: new SubscriptionRepository(deps),
    ai: new AIRepository(deps),
    tickets: new TicketRepository(deps),
    creatives: new CreativeRepository(deps),
    landingPages: new LandingPageRepository(deps),
    workflows: new WorkflowRepository(deps),
    integrations: new IntegrationRepository(deps),
  };
}

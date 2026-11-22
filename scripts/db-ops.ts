import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createJsonBackup, rollbackFromBackup, validateJsonForPostgresMigration } from './migrate-json-to-postgres.ts';
import { checkDatabaseHealth, disconnectDatabase, isPostgresConfigured, sanitizeDatabaseUrl } from '../server/db/prisma.ts';

dotenv.config();

const dbJsonPath = path.resolve(process.cwd(), 'database/data/ner-db.json');
const backupDir = path.resolve(process.cwd(), 'database/backups');

async function main() {
  const command = process.argv[2] || 'validate';

  if (command === 'backup') {
    const jsonBackup = createJsonBackup(dbJsonPath, backupDir);
    let pgBackupPath: string | null = null;
    let pgNote = 'DATABASE_URL não configurada — backup SHA-256 do JSON gerado.';

    if (isPostgresConfigured()) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const target = path.join(backupDir, `ner-postgres-${stamp}.dump`);
      try {
        execFileSync('pg_dump', ['--format=custom', '--file', target, process.env.DATABASE_URL!], {
          stdio: 'pipe',
        });
        pgBackupPath = target;
        pgNote = 'Backup PostgreSQL (pg_dump custom) concluído.';
      } catch (err: any) {
        pgNote = `pg_dump indisponível ou PostgreSQL inacessível: ${err?.message || 'erro desconhecido'}`;
      }
    }

    console.log(
      JSON.stringify(
        {
          action: 'db:backup',
          jsonBackupPath: jsonBackup.backupPath,
          jsonSha256: jsonBackup.sha256,
          postgresBackupPath: pgBackupPath,
          note: pgNote,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'restore') {
    const targetFile = process.argv[3];
    if (!targetFile) {
      console.error('Uso: npm run db:restore -- <caminho-do-backup.json|dump>');
      process.exit(1);
    }
    const resolved = path.resolve(process.cwd(), targetFile);
    if (!fs.existsSync(resolved)) {
      console.error(`Arquivo de backup não encontrado: ${resolved}`);
      process.exit(1);
    }

    if (resolved.endsWith('.dump')) {
      if (!isPostgresConfigured()) {
        console.error('DATABASE_URL obrigatória para restaurar backup .dump no PostgreSQL.');
        process.exit(1);
      }
      execFileSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', process.env.DATABASE_URL!, resolved], {
        stdio: 'inherit',
      });
      console.log(JSON.stringify({ action: 'db:restore', mode: 'postgres', restoredFrom: resolved }, null, 2));
      return;
    }

    const res = rollbackFromBackup(resolved, dbJsonPath);
    console.log(JSON.stringify({ action: 'db:restore', mode: 'json', restoredFrom: resolved, ...res }, null, 2));
    return;
  }

  if (command === 'validate') {
    const jsonValidation = validateJsonForPostgresMigration(dbJsonPath, { createBackup: false });
    const dbHealth = await checkDatabaseHealth();
    const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
    const migrationsDir = path.resolve(process.cwd(), 'prisma/migrations');
    const migrationFolders = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
      : [];

    console.log(
      JSON.stringify(
        {
          action: 'db:validate',
          schemaPresent: fs.existsSync(schemaPath),
          migrationsCount: migrationFolders.length,
          migrations: migrationFolders,
          databaseTarget: sanitizeDatabaseUrl(process.env.DATABASE_URL),
          databaseHealth: dbHealth,
          jsonIntegrity: {
            status: jsonValidation.status,
            sourceSha256: jsonValidation.sourceSha256,
            totalRecordsFound: jsonValidation.totalRecordsFound,
            referentialIssuesCount: jsonValidation.referentialIssues.length,
            duplicateIdsCount: jsonValidation.duplicateIds.length,
            conversionErrorsCount: jsonValidation.conversionErrors.length,
            financialChecksums: jsonValidation.financialChecksums,
          },
        },
        null,
        2
      )
    );
    await disconnectDatabase();
    if (jsonValidation.status === 'FAILED_INTEGRITY') {
      process.exit(1);
    }
    return;
  }

  console.error(`Comando desconhecido: ${command}. Use: backup | restore | validate`);
  process.exit(1);
}

main().catch(async (err) => {
  console.error('[NER-DB-OPS] Error:', err?.message || err);
  await disconnectDatabase();
  process.exit(1);
});

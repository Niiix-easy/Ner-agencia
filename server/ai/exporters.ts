/**
 * Real report exporters (CSV, valid OOXML XLSX, valid PDF 1.4)
 * Built with Node standard library only — zero external dependencies.
 * Supports segmented AI billing breakdowns by Provider, Client, and Provider x Client.
 */

export type ExportSegmentMode =
  | 'detailed'
  | 'provider'
  | 'client'
  | 'department'
  | 'provider_client'
  | 'client_provider_department';

export interface ExportRow {
  requestId: string;
  date: string;
  organizationId: string;
  userId: string;
  clientId: string;
  clientName?: string;
  billingCategory?: string;
  department: string;
  action: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
  costBrl: number | null;
  costStatus: string;
  latencyMs: number;
  status: string;
}

export interface BillingSegmentSummary {
  byProvider: {
    provider: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    costBrl: number;
  }[];
  byClient: {
    clientId: string;
    clientName: string;
    billingCategory: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    costBrl: number;
  }[];
  byProviderClient: {
    provider: string;
    clientId: string;
    clientName: string;
    requests: number;
    totalTokens: number;
    costUsd: number;
    costBrl: number;
  }[];
  byDepartment: {
    department: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    costBrl: number;
  }[];
  byClientProviderDepartment: {
    clientId: string;
    clientName: string;
    provider: string;
    department: string;
    requests: number;
    totalTokens: number;
    costUsd: number;
    costBrl: number;
  }[];
}

export function buildBillingSegments(rows: ExportRow[]): BillingSegmentSummary {
  const provMap = new Map<
    string,
    {
      provider: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      costUsd: number;
      costBrl: number;
    }
  >();
  const cliMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      categories: Set<string>;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      costUsd: number;
      costBrl: number;
    }
  >();
  const deptMap = new Map<
    string,
    {
      department: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      costUsd: number;
      costBrl: number;
    }
  >();
  const provCliMap = new Map<
    string,
    {
      provider: string;
      clientId: string;
      clientName: string;
      requests: number;
      totalTokens: number;
      costUsd: number;
      costBrl: number;
    }
  >();
  const cpdMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      provider: string;
      department: string;
      requests: number;
      totalTokens: number;
      costUsd: number;
      costBrl: number;
    }
  >();

  for (const r of rows) {
    const inTok = r.inputTokens ?? 0;
    const outTok = r.outputTokens ?? 0;
    const cacheTok = r.cachedInputTokens ?? 0;
    const usd = r.costUsd ?? 0;
    const brl = r.costBrl ?? 0;
    const clientName = r.clientName || r.clientId || 'Agencia (Interno)';
    const category = r.billingCategory || (r.clientId === 'Agência (Interno)' ? 'internal_agency' : 'client_included');

    const pEntry = provMap.get(r.provider) || {
      provider: r.provider,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      costBrl: 0,
    };
    pEntry.requests += 1;
    pEntry.inputTokens += inTok;
    pEntry.outputTokens += outTok;
    pEntry.cachedTokens += cacheTok;
    pEntry.costUsd = Number((pEntry.costUsd + usd).toFixed(6));
    pEntry.costBrl = Number((pEntry.costBrl + brl).toFixed(4));
    provMap.set(r.provider, pEntry);

    const cKey = r.clientId || 'Agência (Interno)';
    const cEntry = cliMap.get(cKey) || {
      clientId: cKey,
      clientName,
      categories: new Set<string>(),
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      costBrl: 0,
    };
    cEntry.categories.add(category);
    cEntry.requests += 1;
    cEntry.inputTokens += inTok;
    cEntry.outputTokens += outTok;
    cEntry.cachedTokens += cacheTok;
    cEntry.costUsd = Number((cEntry.costUsd + usd).toFixed(6));
    cEntry.costBrl = Number((cEntry.costBrl + brl).toFixed(4));
    cliMap.set(cKey, cEntry);

    const dKey = r.department || 'NER AI Center';
    const dEntry = deptMap.get(dKey) || {
      department: dKey,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      costBrl: 0,
    };
    dEntry.requests += 1;
    dEntry.inputTokens += inTok;
    dEntry.outputTokens += outTok;
    dEntry.cachedTokens += cacheTok;
    dEntry.costUsd = Number((dEntry.costUsd + usd).toFixed(6));
    dEntry.costBrl = Number((dEntry.costBrl + brl).toFixed(4));
    deptMap.set(dKey, dEntry);

    const pcKey = `${r.provider}::${cKey}`;
    const pcEntry = provCliMap.get(pcKey) || {
      provider: r.provider,
      clientId: cKey,
      clientName,
      requests: 0,
      totalTokens: 0,
      costUsd: 0,
      costBrl: 0,
    };
    pcEntry.requests += 1;
    pcEntry.totalTokens += inTok + outTok;
    pcEntry.costUsd = Number((pcEntry.costUsd + usd).toFixed(6));
    pcEntry.costBrl = Number((pcEntry.costBrl + brl).toFixed(4));
    provCliMap.set(pcKey, pcEntry);

    const cpdKey = `${cKey}::${r.provider}::${dKey}`;
    const cpdEntry = cpdMap.get(cpdKey) || {
      clientId: cKey,
      clientName,
      provider: r.provider,
      department: dKey,
      requests: 0,
      totalTokens: 0,
      costUsd: 0,
      costBrl: 0,
    };
    cpdEntry.requests += 1;
    cpdEntry.totalTokens += inTok + outTok;
    cpdEntry.costUsd = Number((cpdEntry.costUsd + usd).toFixed(6));
    cpdEntry.costBrl = Number((cpdEntry.costBrl + brl).toFixed(4));
    cpdMap.set(cpdKey, cpdEntry);
  }

  return {
    byProvider: Array.from(provMap.values()).sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests),
    byClient: Array.from(cliMap.values())
      .map((c) => ({
        clientId: c.clientId,
        clientName: c.clientName,
        billingCategory: Array.from(c.categories).join(' / '),
        requests: c.requests,
        inputTokens: c.inputTokens,
        outputTokens: c.outputTokens,
        cachedTokens: c.cachedTokens,
        costUsd: c.costUsd,
        costBrl: c.costBrl,
      }))
      .sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests),
    byDepartment: Array.from(deptMap.values()).sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests),
    byProviderClient: Array.from(provCliMap.values()).sort(
      (a, b) => b.costUsd - a.costUsd || a.provider.localeCompare(b.provider)
    ),
    byClientProviderDepartment: Array.from(cpdMap.values()).sort(
      (a, b) => b.costUsd - a.costUsd || a.clientName.localeCompare(b.clientName)
    ),
  };
}

function escapeCsvCell(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportUsageCsv(
  rows: ExportRow[],
  segmentBy: ExportSegmentMode = 'detailed'
): Buffer {
  const segments = buildBillingSegments(rows);
  const lines: string[] = [];

  if (segmentBy === 'provider') {
    lines.push(
      ['Provedor', 'Requisicoes', 'Tokens Entrada', 'Tokens Saida', 'Tokens Cache', 'Total Tokens', 'Custo USD', 'Custo BRL'].join(',')
    );
    for (const p of segments.byProvider) {
      lines.push(
        [
          p.provider,
          p.requests,
          p.inputTokens,
          p.outputTokens,
          p.cachedTokens,
          p.inputTokens + p.outputTokens,
          p.costUsd.toFixed(6),
          p.costBrl.toFixed(4),
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
  }

  if (segmentBy === 'client') {
    lines.push(
      ['Cliente ID', 'Cliente Nome', 'Categoria Faturamento', 'Requisicoes', 'Tokens Entrada', 'Tokens Saida', 'Total Tokens', 'Custo USD', 'Custo BRL'].join(',')
    );
    for (const c of segments.byClient) {
      lines.push(
        [
          c.clientId,
          c.clientName,
          c.billingCategory,
          c.requests,
          c.inputTokens,
          c.outputTokens,
          c.inputTokens + c.outputTokens,
          c.costUsd.toFixed(6),
          c.costBrl.toFixed(4),
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
  }

  if (segmentBy === 'department') {
    lines.push(
      ['Departamento', 'Requisicoes', 'Tokens Entrada', 'Tokens Saida', 'Tokens Cache', 'Total Tokens', 'Custo USD', 'Custo BRL'].join(',')
    );
    for (const d of segments.byDepartment) {
      lines.push(
        [
          d.department,
          d.requests,
          d.inputTokens,
          d.outputTokens,
          d.cachedTokens,
          d.inputTokens + d.outputTokens,
          d.costUsd.toFixed(6),
          d.costBrl.toFixed(4),
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
  }

  if (segmentBy === 'provider_client' || segmentBy === 'client_provider_department') {
    lines.push('RESUMO DE FATURAMENTO POR PROVEDOR');
    lines.push(['Provedor', 'Requisicoes', 'Tokens Entrada', 'Tokens Saida', 'Custo USD', 'Custo BRL'].join(','));
    for (const p of segments.byProvider) {
      lines.push(
        [p.provider, p.requests, p.inputTokens, p.outputTokens, p.costUsd.toFixed(6), p.costBrl.toFixed(4)]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    lines.push('');
    lines.push('RESUMO DE FATURAMENTO POR CLIENTE');
    lines.push(['Cliente ID', 'Cliente Nome', 'Categoria', 'Requisicoes', 'Total Tokens', 'Custo USD', 'Custo BRL'].join(','));
    for (const c of segments.byClient) {
      lines.push(
        [
          c.clientId,
          c.clientName,
          c.billingCategory,
          c.requests,
          c.inputTokens + c.outputTokens,
          c.costUsd.toFixed(6),
          c.costBrl.toFixed(4),
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    if (segmentBy === 'client_provider_department') {
      lines.push('');
      lines.push('RESUMO DE FATURAMENTO POR DEPARTAMENTO');
      lines.push(['Departamento', 'Requisicoes', 'Tokens Entrada', 'Tokens Saida', 'Total Tokens', 'Custo USD', 'Custo BRL'].join(','));
      for (const d of segments.byDepartment) {
        lines.push(
          [
            d.department,
            d.requests,
            d.inputTokens,
            d.outputTokens,
            d.inputTokens + d.outputTokens,
            d.costUsd.toFixed(6),
            d.costBrl.toFixed(4),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
      lines.push('');
      lines.push('FATURAMENTO CRUZADO: CLIENTE x PROVEDOR x DEPARTAMENTO');
      lines.push(['Cliente ID', 'Cliente Nome', 'Provedor', 'Departamento', 'Requisicoes', 'Total Tokens', 'Custo USD', 'Custo BRL'].join(','));
      for (const row of segments.byClientProviderDepartment) {
        lines.push(
          [
            row.clientId,
            row.clientName,
            row.provider,
            row.department,
            row.requests,
            row.totalTokens,
            row.costUsd.toFixed(6),
            row.costBrl.toFixed(4),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
    } else {
      lines.push('');
      lines.push('FATURAMENTO CRUZADO: PROVEDOR x CLIENTE');
      lines.push(['Provedor', 'Cliente ID', 'Cliente Nome', 'Requisicoes', 'Total Tokens', 'Custo USD', 'Custo BRL'].join(','));
      for (const pc of segments.byProviderClient) {
        lines.push(
          [
            pc.provider,
            pc.clientId,
            pc.clientName,
            pc.requests,
            pc.totalTokens,
            pc.costUsd.toFixed(6),
            pc.costBrl.toFixed(4),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
    }
    lines.push('');
    lines.push('DETALHAMENTO DE EXECUCOES');
  }

  const headers = [
    'Request ID',
    'Data/Hora',
    'Organizacao',
    'Usuario',
    'Cliente ID',
    'Cliente Nome',
    'Categoria Faturamento',
    'Departamento',
    'Acao',
    'Provedor',
    'Modelo',
    'Tokens Entrada',
    'Tokens Saida',
    'Tokens Cache',
    'Tokens Raciocinio',
    'Custo USD',
    'Custo BRL',
    'Natureza Custo',
    'Latencia (ms)',
    'Status',
  ];
  lines.push(headers.join(','));
  for (const r of rows) {
    lines.push(
      [
        r.requestId,
        r.date,
        r.organizationId,
        r.userId,
        r.clientId,
        r.clientName || r.clientId,
        r.billingCategory || '',
        r.department,
        r.action,
        r.provider,
        r.model,
        r.inputTokens ?? 'indisponivel',
        r.outputTokens ?? 'indisponivel',
        r.cachedInputTokens ?? '',
        r.reasoningTokens ?? '',
        r.costUsd !== null ? r.costUsd.toFixed(6) : 'indisponivel',
        r.costBrl !== null ? r.costBrl.toFixed(4) : 'indisponivel',
        r.costStatus,
        r.latencyMs,
        r.status,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  // Prepend UTF-8 BOM for Excel compatibility
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
}

// --- Minimal Store-based ZIP builder for valid OOXML .xlsx ---
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; content: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.content);
    const size = file.content.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, file.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + size;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function xmlEscape(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(idx: number): string {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function exportUsageXlsx(rows: ExportRow[]): Buffer {
  const tableRows: (string | number | null)[][] = [
    [
      'Request ID',
      'Data/Hora',
      'Organizacao',
      'Usuario',
      'Cliente',
      'Departamento',
      'Acao',
      'Provedor',
      'Modelo',
      'Tokens Entrada',
      'Tokens Saida',
      'Tokens Cache',
      'Tokens Raciocinio',
      'Custo USD',
      'Custo BRL',
      'Natureza Custo',
      'Latencia (ms)',
      'Status',
    ],
    ...rows.map((r) => [
      r.requestId,
      r.date,
      r.organizationId,
      r.userId,
      r.clientName || r.clientId,
      r.department,
      r.action,
      r.provider,
      r.model,
      r.inputTokens,
      r.outputTokens,
      r.cachedInputTokens,
      r.reasoningTokens,
      r.costUsd,
      r.costBrl,
      r.costStatus,
      r.latencyMs,
      r.status,
    ]),
  ];

  const sheetRowsXml = tableRows
    .map((cells, rIdx) => {
      const cellsXml = cells
        .map((cell, cIdx) => {
          const ref = `${colLetter(cIdx)}${rIdx + 1}`;
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell ?? '')}</t></is></c>`;
        })
        .join('');
      return `<row r="${rIdx + 1}">${cellsXml}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRowsXml}</sheetData>
</worksheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="NER AI Cost Intelligence" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', content: Buffer.from(contentTypesXml, 'utf8') },
    { name: '_rels/.rels', content: Buffer.from(relsXml, 'utf8') },
    { name: 'xl/workbook.xml', content: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', content: Buffer.from(workbookRelsXml, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', content: Buffer.from(sheetXml, 'utf8') },
  ]);
}

// --- Valid Multi-Page PDF 1.4 Generator ---
function pdfEscape(str: string): string {
  const ascii = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' ');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function exportUsagePdf(
  summaryLines: string[],
  rows: ExportRow[],
  segmentBy: ExportSegmentMode = 'provider_client'
): Buffer {
  const segments = buildBillingSegments(rows);
  const lines: string[] = [
    'NER AGENCY OS - RELATORIO DE FATURAMENTO E CONSUMO DE IA',
    `Gerado em: ${new Date().toISOString()} | Segmentacao: ${segmentBy}`,
    '================================================================================',
    ...summaryLines,
    '--------------------------------------------------------------------------------',
  ];

  if (
    segmentBy === 'provider' ||
    segmentBy === 'provider_client' ||
    segmentBy === 'client_provider_department' ||
    segmentBy === 'detailed'
  ) {
    lines.push('FATURAMENTO SEGMENTADO POR PROVEDOR:');
    lines.push('PROVEDOR | REQS | TOKENS (IN/OUT) | CUSTO USD | CUSTO BRL');
    for (const p of segments.byProvider) {
      lines.push(
        `${p.provider} | ${p.requests} | ${p.inputTokens}/${p.outputTokens} | $${p.costUsd.toFixed(4)} | R$${p.costBrl.toFixed(2)}`
      );
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  if (
    segmentBy === 'client' ||
    segmentBy === 'provider_client' ||
    segmentBy === 'client_provider_department' ||
    segmentBy === 'detailed'
  ) {
    lines.push('FATURAMENTO SEGMENTADO POR CLIENTE:');
    lines.push('CLIENTE | CATEGORIA | REQS | TOTAL TOKENS | CUSTO USD | CUSTO BRL');
    for (const c of segments.byClient) {
      lines.push(
        `${c.clientName} (${c.clientId}) | ${c.billingCategory} | ${c.requests} | ${c.inputTokens + c.outputTokens} | $${c.costUsd.toFixed(4)} | R$${c.costBrl.toFixed(2)}`
      );
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  if (
    segmentBy === 'department' ||
    segmentBy === 'client_provider_department' ||
    segmentBy === 'detailed'
  ) {
    lines.push('FATURAMENTO SEGMENTADO POR DEPARTAMENTO:');
    lines.push('DEPARTAMENTO | REQS | TOKENS (IN/OUT) | CUSTO USD | CUSTO BRL');
    for (const d of segments.byDepartment) {
      lines.push(
        `${d.department} | ${d.requests} | ${d.inputTokens}/${d.outputTokens} | $${d.costUsd.toFixed(4)} | R$${d.costBrl.toFixed(2)}`
      );
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  if (segmentBy === 'provider_client' || segmentBy === 'detailed') {
    lines.push('MATRIZ DE FATURAMENTO: PROVEDOR x CLIENTE:');
    lines.push('PROVEDOR | CLIENTE | REQS | TOTAL TOKENS | CUSTO USD | CUSTO BRL');
    for (const pc of segments.byProviderClient) {
      lines.push(
        `${pc.provider} | ${pc.clientName} | ${pc.requests} | ${pc.totalTokens} | $${pc.costUsd.toFixed(4)} | R$${pc.costBrl.toFixed(2)}`
      );
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  if (segmentBy === 'client_provider_department' || segmentBy === 'detailed') {
    lines.push('MATRIZ DE FATURAMENTO: CLIENTE x PROVEDOR x DEPARTAMENTO:');
    lines.push('CLIENTE | PROVEDOR | DEPARTAMENTO | REQS | TOKENS | CUSTO USD | CUSTO BRL');
    for (const row of segments.byClientProviderDepartment) {
      lines.push(
        `${row.clientName} | ${row.provider} | ${row.department} | ${row.requests} | ${row.totalTokens} | $${row.costUsd.toFixed(4)} | R$${row.costBrl.toFixed(2)}`
      );
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  if (segmentBy === 'detailed' || segmentBy === 'provider_client' || segmentBy === 'client_provider_department') {
    lines.push('EXECUCOES AUDITAVEIS:');
    lines.push('REQ_ID | CLIENTE | DEPT | PROVEDOR/MODELO | TOKENS(IN/OUT) | USD | BRL | STATUS');
    for (const r of rows.slice(0, 120)) {
      const costUsd = r.costUsd !== null ? `$${r.costUsd.toFixed(4)}` : 'N/D';
      const costBrl = r.costBrl !== null ? `R$${r.costBrl.toFixed(2)}` : 'N/D';
      lines.push(
        `${r.requestId.slice(0, 12)} | ${r.clientName || r.clientId} | ${r.department} | ${r.provider}/${r.model} | ${r.inputTokens ?? '-'}/${r.outputTokens ?? '-'} | ${costUsd} | ${costBrl} | ${r.status}`
      );
    }
    if (rows.length > 120) {
      lines.push(`... e mais ${rows.length - 120} registros (exporte CSV/XLSX para base integral).`);
    }
  }

  // Paginate lines cleanly (max 54 lines per PDF page)
  const LINES_PER_PAGE = 54;
  const pageChunks: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pageChunks.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (pageChunks.length === 0) pageChunks.push(['Sem registros no periodo filtrado.']);

  const objects: string[] = [];
  // Obj 1: Catalog, Obj 2: Pages (placeholder), Obj 3: Font
  const fontObjNum = 3;
  const pageObjNums: number[] = [];

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(''); // placeholder for obj 2 (/Pages)
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let nextObjNum = 4;
  for (let pIdx = 0; pIdx < pageChunks.length; pIdx++) {
    const chunk = pageChunks[pIdx];
    const pageObjNum = nextObjNum++;
    const contentObjNum = nextObjNum++;
    pageObjNums.push(pageObjNum);

    const streamOps = ['BT', '/F1 8.5 Tf', '32 764 Td', '13 TL'];
    for (let i = 0; i < chunk.length; i++) {
      const safe = pdfEscape(chunk[i]);
      if (i === 0) {
        streamOps.push(`(${safe}) Tj`);
      } else {
        streamOps.push(`T* (${safe}) Tj`);
      }
    }
    streamOps.push('ET');
    const streamContent = streamOps.join('\n');

    objects[pageObjNum - 1] = `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>\nendobj\n`;
    objects[contentObjNum - 1] = `${contentObjNum} 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  }

  const kidsRefs = pageObjNums.map((n) => `${n} 0 R`).join(' ');
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageObjNums.length} >>\nendobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

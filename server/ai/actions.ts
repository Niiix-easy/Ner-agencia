import { AiDepartment, AiPurpose } from './types.ts';

export interface AiActionDefinition {
  id: string;
  department: AiDepartment;
  name: string;
  purpose: AiPurpose;
  description: string;
  isCritical: boolean;
  cacheable: boolean;
  isSystem: boolean;
}

export const DEFAULT_AI_ACTIONS: AiActionDefinition[] = [
  {
    id: 'strategy.diagnosis',
    department: 'NER Strategy',
    name: 'Diagnóstico estratégico',
    purpose: 'marketing_strategy',
    description: 'Diagnóstico completo de posicionamento, funil e oportunidades de crescimento.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'strategy.planning',
    department: 'NER Strategy',
    name: 'Planejamento de marketing',
    purpose: 'marketing_strategy',
    description: 'Plano tático e metas de aquisição e retenção.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'creative.copy.generate',
    department: 'NER Creative',
    name: 'Criar copy',
    purpose: 'copywriting',
    description: 'Geração de textos persuasivos para anúncios e campanhas.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'creative.headline.generate',
    department: 'NER Creative',
    name: 'Criar headline',
    purpose: 'creatives',
    description: 'Criação de variações de headlines e ganchos (hooks).',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'creative.script.generate',
    department: 'NER Creative',
    name: 'Criar roteiro',
    purpose: 'creatives',
    description: 'Roteirização de vídeos curtos, VSLs e criativos.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'creative.ad.analyze',
    department: 'NER Creative',
    name: 'Analisar criativo',
    purpose: 'creatives',
    description: 'Auditoria de clareza, oferta e aderência de peça criativa.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'performance.campaign.analyze',
    department: 'NER Performance',
    name: 'Analisar campanha',
    purpose: 'campaign_analysis',
    description: 'Diagnóstico consultivo de métricas de mídia paga.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'performance.optimization.recommend',
    department: 'NER Performance',
    name: 'Recomendar otimização',
    purpose: 'campaign_analysis',
    description: 'Sugestão de hipóteses de otimização respeitando significância estatística.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'tracking.events.diagnose',
    department: 'NER Tracking',
    name: 'Diagnosticar eventos',
    purpose: 'data_analysis',
    description: 'Auditoria de Pixel, CAPI, event_id e deduplicação.',
    isCritical: true,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'intelligence.report.generate',
    department: 'NER Intelligence',
    name: 'Gerar relatório',
    purpose: 'data_analysis',
    description: 'Síntese executiva separando fatos observados e hipóteses.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'intelligence.metrics.query',
    department: 'NER Intelligence',
    name: 'Consultar indicadores',
    purpose: 'data_analysis',
    description: 'Interpretação analítica de KPIs e anomalias.',
    isCritical: false,
    cacheable: true,
    isSystem: true,
  },
  {
    id: 'web.landing.generate',
    department: 'NER Web',
    name: 'Criar landing page',
    purpose: 'copywriting',
    description: 'Estruturação completa de seções e SEO de Landing Page.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'web.copy.generate',
    department: 'NER Web',
    name: 'Gerar copy de página',
    purpose: 'copywriting',
    description: 'Copywriting para páginas institucionais, oferta e FAQ.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'studio.software.specification',
    department: 'NER Digital Studio',
    name: 'Criar especificação de software',
    purpose: 'software_dev',
    description: 'Levantamento de requisitos, arquitetura e critérios de aceite.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'studio.code.review',
    department: 'NER Digital Studio',
    name: 'Revisar código',
    purpose: 'coding',
    description: 'Revisão técnica, segurança, performance e testes.',
    isCritical: false,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'client.response.generate',
    department: 'NER Client Experience',
    name: 'Gerar resposta',
    purpose: 'customer_support',
    description: 'Atendimento contextualizado no escopo isolado do cliente.',
    isCritical: true,
    cacheable: false,
    isSystem: true,
  },
  {
    id: 'automation.request.classify',
    department: 'NER Automation',
    name: 'Classificar solicitação',
    purpose: 'automation',
    description: 'Classificação e roteamento de eventos e leads em workflows.',
    isCritical: true,
    cacheable: false,
    isSystem: true,
  },
];

const DEFAULT_BY_DEPARTMENT: Partial<Record<AiDepartment, string>> = {
  'NER Strategy': 'strategy.diagnosis',
  'NER Creative': 'creative.copy.generate',
  'NER Performance': 'performance.campaign.analyze',
  'NER Tracking': 'tracking.events.diagnose',
  'NER Intelligence': 'intelligence.report.generate',
  'NER Web': 'web.landing.generate',
  'NER Digital Studio': 'studio.software.specification',
  'NER Client Experience': 'client.response.generate',
  'NER Automation': 'automation.request.classify',
  'NER AI Center': 'general.playground.execute',
};

const DEFAULT_BY_PURPOSE: Record<AiPurpose, string> = {
  general_assistant: 'general.assistant.query',
  marketing_strategy: 'strategy.diagnosis',
  copywriting: 'creative.copy.generate',
  creatives: 'creative.headline.generate',
  campaign_analysis: 'performance.campaign.analyze',
  data_analysis: 'intelligence.metrics.query',
  coding: 'studio.code.review',
  software_dev: 'studio.software.specification',
  document_analysis: 'document.analysis.extract',
  customer_support: 'client.response.generate',
  automation: 'automation.request.classify',
  embeddings: 'intelligence.embeddings.generate',
};

export function resolveActionIdentifier(
  explicitAction: string | undefined,
  department: AiDepartment,
  purpose: AiPurpose,
  catalog: AiActionDefinition[] = DEFAULT_AI_ACTIONS
): { actionId: string; definition?: AiActionDefinition } {
  const clean = explicitAction?.trim();
  if (clean) {
    const found = catalog.find((a) => a.id === clean);
    return { actionId: clean, definition: found };
  }
  const byDept = DEFAULT_BY_DEPARTMENT[department];
  if (byDept) {
    const found = catalog.find((a) => a.id === byDept);
    return { actionId: byDept, definition: found };
  }
  const byPurpose = DEFAULT_BY_PURPOSE[purpose] || 'general.assistant.query';
  return {
    actionId: byPurpose,
    definition: catalog.find((a) => a.id === byPurpose),
  };
}

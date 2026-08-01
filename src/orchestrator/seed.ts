export interface OntologyField {
  name: string;
  type: string;
  required: boolean;
}

export interface OntologyEntity {
  name: string;
  fields: OntologyField[];
}

export interface OntologyRelationship {
  from: string;
  to: string;
  type: 'owns' | 'references' | 'contains';
}

export interface OntologySchema {
  entities: OntologyEntity[];
  relationships: OntologyRelationship[];
  invariants: string[];
}

export interface SeedMetadata {
  seedId: string;
  createdAt: string;
  interviewRounds: number;
  evidenceCount: number;
  assumptionCount: number;
  weakDimensions: string[];
}

export interface Seed {
  goal: string;
  constraints: string[];
  acceptanceCriteria: string[];
  ontologySchema?: OntologySchema;
  exitConditions: string[];
  metadata: SeedMetadata;
}

export function renderOntologyBlock(schema: OntologySchema): string {
  if (!schema.entities.length && !schema.invariants.length) return '';

  const entities = schema.entities.map(e => {
    const fields = e.fields.map(f =>
      `    ${f.required ? '●' : '○'} ${f.name}: ${f.type}`
    ).join('\n');
    return `  [${e.name}]\n${fields}`;
  }).join('\n');

  const rels = schema.relationships.map(r =>
    `  ${r.from} --${r.type}--> ${r.to}`
  ).join('\n');

  const invs = schema.invariants.map(i => `  • ${i}`).join('\n');

  return `\n=== Ontology ===\nEntities:\n${entities}\n\nRelationships:\n${rels || '  (none)'}\n\nInvariants:\n${invs || '  (none)'}\n================`;
}

export function renderSeedBlock(seed: Seed): string {
  const acList = seed.acceptanceCriteria.map((ac, i) => `  ${i + 1}. ${ac}`).join('\n');
  const cList = seed.constraints.map(c => `  - ${c}`).join('\n') || '  (none specified)';
  const assumptionWarn = seed.metadata.assumptionCount > 0
    ? `\n⚠️ ${seed.metadata.assumptionCount} assumption(s) included — verify before building`
    : '';
  const ontology = seed.ontologySchema ? renderOntologyBlock(seed.ontologySchema) : '';

  return `\n=== SEED (from Interview) ===\nGoal: ${seed.goal}\n\nAcceptance Criteria:\n${acList}\n\nConstraints:\n${cList}${assumptionWarn}${ontology}\n=============================`;
}

export function buildSeedFromEvidence(
  request: string,
  known: Array<{ fact: string; source?: string; dimension?: string }>,
  round: number,
): Seed {
  const goalFacts = known.filter(e => e.dimension === 'goal');
  const constraintFacts = known.filter(e => e.dimension === 'constraint');
  const successFacts = known.filter(e => e.dimension === 'success');
  const ontologyFacts = known.filter(e => e.dimension === 'ontology');
  const assumptions = known.filter(e => e.source === 'assumption');

  const seed: Seed = {
    goal: goalFacts.map(e => e.fact).join('. ') || request,
    constraints: constraintFacts.map(e => e.fact),
    acceptanceCriteria: successFacts.map(e => e.fact),
    exitConditions: [],
    metadata: {
      seedId: `seed_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      interviewRounds: round,
      evidenceCount: known.length,
      assumptionCount: assumptions.length,
      weakDimensions: [],
    },
  };

  if (ontologyFacts.length > 0) {
    seed.ontologySchema = {
      entities: [],
      relationships: [],
      invariants: ontologyFacts.map(e => e.fact),
    };
  }

  return seed;
}

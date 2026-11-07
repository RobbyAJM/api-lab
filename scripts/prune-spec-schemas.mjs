import pg from 'pg';
import fs from 'fs';

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      dbUrl = trimmed.substring('DATABASE_URL='.length).trim();
    }
  }
}
dbUrl = dbUrl || 'postgres://root:root@localhost:5432/api_lab?sslmode=disable';
const pool = new pg.Pool({ connectionString: dbUrl });

function pruneEndpointSpec(spec) {
  if (!spec || typeof spec !== 'object') return spec;
  const allSchemas = spec.schemas;
  const allEnums = spec.enums;
  if (!allSchemas || typeof allSchemas !== 'object' || Object.keys(allSchemas).length === 0) {
    return spec;
  }

  const reachableSchemas = {};
  const reachableEnums = {};
  const queue = [];
  const visitedTypes = new Set();

  const enqueueType = (rawType) => {
    if (!rawType || typeof rawType !== 'string') return;
    const base = rawType.replace(/\[\]$/, '').trim();
    if (!base) return;
    if (!visitedTypes.has(base)) queue.push(base);
    const short = base.split('.').pop() || base;
    if (short && short !== base && !visitedTypes.has(short)) queue.push(short);
  };

  enqueueType(spec.requestTypeName);
  enqueueType(spec.responseTypeName);
  if (Array.isArray(spec.requestFields)) {
    for (const f of spec.requestFields) enqueueType(f?.type);
  }
  if (Array.isArray(spec.responseFields)) {
    for (const f of spec.responseFields) enqueueType(f?.type);
  }

  while (queue.length > 0) {
    const typeName = queue.pop();
    if (visitedTypes.has(typeName)) continue;
    visitedTypes.add(typeName);

    if (allEnums && allEnums[typeName]) {
      reachableEnums[typeName] = allEnums[typeName];
    }

    let matchedKey = allSchemas[typeName] ? typeName : undefined;
    if (!matchedKey) {
      matchedKey = Object.keys(allSchemas).find(
        (k) => k === typeName || k.split('.').pop() === typeName
      );
    }

    if (matchedKey && allSchemas[matchedKey]) {
      reachableSchemas[matchedKey] = allSchemas[matchedKey];
      for (const field of allSchemas[matchedKey]) {
        enqueueType(field.type);
        if (field.enum && Array.isArray(field.enum) && field.enum.length > 0 && field.type) {
          reachableEnums[field.type] = field.enum;
        }
      }
    }
  }

  return {
    ...spec,
    schemas: reachableSchemas,
    enums: reachableEnums,
  };
}

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, config
      FROM endpoints
      WHERE config ? 'specification'
    `);
    console.log(`Found ${res.rows.length} endpoints with specification`);

    let updatedCount = 0;
    for (const row of res.rows) {
      const config = row.config;
      if (!config.specification) continue;

      const originalSchemaCount = config.specification.schemas ? Object.keys(config.specification.schemas).length : 0;
      const prunedSpec = pruneEndpointSpec(config.specification);
      const newSchemaCount = Object.keys(prunedSpec.schemas || {}).length;

      if (originalSchemaCount !== newSchemaCount) {
        config.specification = prunedSpec;
        await client.query(
          `UPDATE endpoints SET config = $1 WHERE id = $2`,
          [config, row.id]
        );
        updatedCount++;
      }
    }

    console.log(`Successfully pruned ${updatedCount} endpoints.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

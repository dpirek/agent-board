'use strict';

// Runtime metadata mirroring db/schema.sql. Keeping it explicit makes validation
// deterministic without requiring a SQL parser or third-party package.
const entities = {
  organizations: {
    fields: {
      id: { type: 'uuid', required: true, generated: true },
      name: { type: 'string', required: true },
      created_at: { type: 'timestamp', required: true, generated: true }
    }
  },
  users: {
    fields: {
      id: { type: 'uuid', required: true, generated: true },
      organization_id: { type: 'uuid', references: 'organizations', nullable: true },
      email: { type: 'string', required: true },
      name: { type: 'string', nullable: true },
      avatar_url: { type: 'string', nullable: true },
      created_at: { type: 'timestamp', required: true, generated: true }
    }
  },
  projects: {
    fields: {
      id: { type: 'uuid', required: true, generated: true },
      organization_id: { type: 'uuid', required: true, references: 'organizations' },
      key: { type: 'string', required: true, maxLength: 10 },
      name: { type: 'string', required: true },
      description: { type: 'string', nullable: true },
      created_at: { type: 'timestamp', required: true, generated: true }
    },
    unique: [['organization_id', 'key']]
  },
  issue_types: {
    fields: {
      id: { type: 'uuid', required: true, generated: true },
      organization_id: { type: 'uuid', references: 'organizations', nullable: true },
      name: { type: 'string', required: true },
      icon: { type: 'string', nullable: true }
    }
  },
  statuses: {
    fields: {
      id: { type: 'uuid', required: true, generated: true },
      organization_id: { type: 'uuid', references: 'organizations', nullable: true },
      name: { type: 'string', required: true },
      category: { type: 'string', nullable: true }
    }
  }
};

const entityNames = Object.freeze(Object.keys(entities));

function getEntity(name) {
  const entity = entities[name];
  if (!entity) {
    throw new Error(`Unknown entity '${name}'. Expected one of: ${entityNames.join(', ')}`);
  }
  return entity;
}

module.exports = { entities, entityNames, getEntity };


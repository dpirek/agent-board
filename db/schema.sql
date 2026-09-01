CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  key VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),

  UNIQUE (organization_id, key)
);

CREATE TABLE issue_types (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  icon TEXT
);

CREATE TABLE statuses (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  category TEXT
);
-- Enterprise Cloud Database Schema (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: companies (Tenants)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: users (Employees)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'employee', -- 'employee', 'manager', 'admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: sessions (Synced from macOS local DB)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL, -- Reference to the SQLite id on the client machine
    date DATE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    total_seconds INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL, -- 'active', 'paused', 'completed'
    type VARCHAR(50) NOT NULL, -- 'manual', 'automatic'
    last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, local_id) -- Prevent duplicate syncs from the same client
);

-- Table: app_usage (Aggregated metrics)
CREATE TABLE app_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    app_category VARCHAR(100) NOT NULL, -- Keep privacy high: sync category, not exact window title
    duration_seconds INTEGER DEFAULT 0,
    UNIQUE(user_id, date, app_category)
);

-- Indexes for fast querying on the Manager Dashboard
CREATE INDEX idx_sessions_company_date ON sessions(company_id, date);
CREATE INDEX idx_sessions_user_date ON sessions(user_id, date);
CREATE INDEX idx_app_usage_company_date ON app_usage(company_id, date);

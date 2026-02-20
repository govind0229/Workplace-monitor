const express = require('express');
const cors = require('cors');
// const { Pool } = require('pg'); // PostgreSQL client
// const jwt = require('jsonwebtoken'); // For parsing SSO tokens

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Mock database connection for development phase
// const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Mock authentication middleware
const requireAuth = (req, res, next) => {
    // In production, verify JWT and extract user_id & company_id
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        // For development, we'll allow mock headers
        const mockUserId = req.headers['x-mock-user-id'];
        const mockCompanyId = req.headers['x-mock-company-id'];

        if (mockUserId && mockCompanyId) {
            req.user = { id: mockUserId, company_id: mockCompanyId };
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // JWT Verification Logic Placeholder
    next();
};

// ------------------------------------------------------------------
// Client Sync API (For the local macOS app to push data)
// ------------------------------------------------------------------

// Sync Sessions (Batch upsert)
app.post('/api/v1/sync/sessions', requireAuth, async (req, res) => {
    const { sessions } = req.body;
    const { id: user_id, company_id } = req.user;

    console.log(`[SYNC] Received ${sessions?.length || 0} sessions from user ${user_id}`);

    // In production:
    // INSERT INTO sessions (...) VALUES (...)
    // ON CONFLICT (user_id, local_id) DO UPDATE SET total_seconds = EXCLUDED.total_seconds

    res.json({ success: true, synced_count: sessions?.length || 0 });
});

// Sync App Usage Categories (Batch)
app.post('/api/v1/sync/app-usage', requireAuth, async (req, res) => {
    const { usage } = req.body;
    const { id: user_id, company_id } = req.user;

    console.log(`[SYNC] Received app usage data from user ${user_id}`);

    res.json({ success: true });
});


// ------------------------------------------------------------------
// Manager Dashboard API (For the web portal)
// ------------------------------------------------------------------

app.get('/api/v1/manager/team-stats', requireAuth, async (req, res) => {
    const { company_id } = req.user;

    // Mock response for Manager Dashboard
    res.json({
        company_id,
        period: "today",
        total_active_employees: 42,
        average_work_hours: 6.5,
        departments: [
            { name: "Engineering", avg_hours: 7.2 },
            { name: "Sales", avg_hours: 5.8 }
        ]
    });
});

app.listen(PORT, () => {
    console.log(`Enterprise Cloud API running on port ${PORT}`);
});

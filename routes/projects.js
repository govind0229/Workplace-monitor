const express = require('express');
const router = express.Router();
const { createProject, getProjects, deleteProject, getProjectReport } = require('../db');

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

router.get('/projects', (req, res) => {
    res.json({ projects: getProjects() });
});

router.post('/projects', asyncHandler(async (req, res) => {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    try {
        const id = createProject(name.trim(), color || '#8b5cf6');
        res.json({ success: true, id });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'A project with this name already exists' });
        }
        throw e;
    }
}));

router.delete('/projects/:id', asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });
    deleteProject(id);
    res.json({ success: true });
}));

router.get('/project-report', (req, res) => {
    res.json({ report: getProjectReport() });
});

module.exports = router;

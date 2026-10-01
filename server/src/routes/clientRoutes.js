import { Router } from 'express';
import { listClients, createClient } from '../controllers/clientController.js';
import { requireAuth } from '../middleware/auth.js';
import { blockVirtualUserWrite } from '../utils/virtualTestUser.js';

const router = Router();

router.use(requireAuth);

// Reads stay available to the virtual test user (Content Calendar's client
// filter needs this list, per Employee view permissions) — only the create
// path is blocked, since it has no designed simulate behavior and would
// otherwise insert a real Client Master document.
router.get('/', listClients);
router.post('/', blockVirtualUserWrite, createClient);

export default router;

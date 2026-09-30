import { Router } from 'express';
import { listClients, createClient } from '../controllers/clientController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', listClients);
router.post('/', createClient);

export default router;

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, userSchema, userUpdateSchema, statusSchema } = require('../utils/validation');
const userController = require('../controllers/userController');

const router = express.Router();

router.use(authMiddleware);

router.get('/managers', permissionMiddleware('users', 'view'), userController.listManagers);
router.get('/', permissionMiddleware('users', 'view'), userController.list);
router.post('/', permissionMiddleware('users', 'add'), validate(userSchema), userController.create);
router.patch('/:id', permissionMiddleware('users', 'edit'), validate(userUpdateSchema), userController.update);
router.patch('/:id/status', permissionMiddleware('users', 'edit'), validate(statusSchema), userController.updateStatus);

module.exports = router;

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getNotices,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice
} = require('../controllers/noticeController');

// Public routes
router.get('/', getNotices);
router.get('/:id', getNotice);

// Protected routes
router.use(protect);

// Teacher routes
router.post('/', authorize('teacher', 'admin'), createNotice);
router.put('/:id', authorize('teacher', 'admin'), updateNotice);
router.delete('/:id', authorize('teacher', 'admin'), deleteNotice);

module.exports = router; 
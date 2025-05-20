const Notice = require('../models/Notice');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { cloudinary } = require('../config/cloudinary');
const fs = require('fs');

// @desc    Create a notice
// @route   POST /api/notices
// @access  Private/Teacher
exports.createNotice = async (req, res) => {
  try {
    const {
      title,
      content,
      category,
      targetAudience,
      scheduledFor,
      priority,
      attachmentUrl
    } = req.body;

    // Validate target audience
    if (targetAudience) {
      if (targetAudience.branches && !Array.isArray(targetAudience.branches)) {
        return res.status(400).json({
          success: false,
          error: 'Branches must be an array'
        });
      }
      if (targetAudience.years && !Array.isArray(targetAudience.years)) {
        return res.status(400).json({
          success: false,
          error: 'Years must be an array'
        });
      }
    }

    // Create notice
    const notice = await Notice.create({
      title,
      content,
      category,
      targetAudience,
      scheduledFor,
      priority,
      attachmentUrl,
      author: req.user._id,
      isPublished: !scheduledFor // If scheduled, don't publish immediately
    });

    // If notice is published immediately, create notifications
    if (!scheduledFor) {
      await createNotifications(notice);
    }

    res.status(201).json({
      success: true,
      data: notice
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get all notices
// @route   GET /api/notices
// @access  Public
exports.getNotices = async (req, res) => {
  try {
    const { category, branch, year, teacher, search, page = 1, limit = 10 } = req.query;
    
    const query = {};
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by branch
    if (branch) {
      query.branch = branch;
    }
    
    // Filter by year
    if (year) {
      query.year = year;
    }
    
    // Filter by teacher
    if (teacher) {
      query.teacher = teacher;
    }
    
    // Search by title or content
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const notices = await Notice.find(query)
      .populate('teacher', 'name')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    const total = await Notice.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: notices.length,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      page: parseInt(page),
      data: notices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get single notice
// @route   GET /api/notices/:id
// @access  Public
exports.getNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id)
      .populate('teacher', 'name');
    
    if (!notice) {
      return res.status(404).json({
        success: false,
        error: 'Notice not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: notice
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Update a notice
// @route   PUT /api/notices/:id
// @access  Private/Teacher
exports.updateNotice = async (req, res) => {
  try {
    const {
      title,
      content,
      category,
      targetAudience,
      scheduledFor,
      priority,
      attachmentUrl,
      isPublished
    } = req.body;

    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        error: 'Notice not found'
      });
    }

    // Check ownership
    if (notice.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this notice'
      });
    }

    // Update notice
    const updatedNotice = await Notice.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        category,
        targetAudience,
        scheduledFor,
        priority,
        attachmentUrl,
        isPublished,
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );

    // If notice is being published now, create notifications
    if (isPublished && !notice.isPublished) {
      await createNotifications(updatedNotice);
    }

    res.status(200).json({
      success: true,
      data: updatedNotice
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Helper function to create notifications for a notice
const createNotifications = async (notice) => {
  try {
    // Find all students who should receive this notice
    const query = { role: 'student' };

    if (notice.targetAudience) {
      const { branches, years } = notice.targetAudience;
      
      if (branches && !branches.includes('All')) {
        query.branch = { $in: branches };
      }
      
      if (years && !years.includes('All')) {
        query.year = { $in: years };
      }
    }

    const students = await User.find(query);

    // Create notifications for each student
    const notifications = students.map(student => ({
      recipient: student._id,
      type: 'notice_posted',
      title: 'New Notice',
      message: notice.title,
      data: {
        noticeId: notice._id,
        category: notice.category,
        priority: notice.priority
      }
    }));

    await Notification.insertMany(notifications);
  } catch (error) {
    console.error('Error creating notifications:', error);
  }
};

// @desc    Delete a notice
// @route   DELETE /api/notices/:id
// @access  Private/Teacher
exports.deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        error: 'Notice not found'
      });
    }

    // Check ownership
    if (notice.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this notice'
      });
    }

    await notice.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get notice statistics
// @route   GET /api/notices/stats
// @access  Private/Teacher
exports.getNoticeStats = async (req, res) => {
  try {
    const stats = await Notice.aggregate([
      { $match: { author: req.user._id } },
      { $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalViews: { $sum: '$views' }
      }},
      { $sort: { count: -1 } }
    ]);

    const priorityStats = await Notice.aggregate([
      { $match: { author: req.user._id } },
      { $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }}
    ]);

    const monthlyStats = await Notice.aggregate([
      { $match: { author: req.user._id } },
      { $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        categoryStats: stats,
        priorityStats,
        monthlyStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

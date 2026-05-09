/**
 * Import all Mongoose models for side-effect registration.
 * Required so `.populate()` can resolve refs (e.g. CourseTeacher → Teacher) on routes
 * that do not import those model files directly.
 */
import "./models/CourseStudyOutline.js";
import "./models/CourseTeacher.js";
import "./models/ProgramFaq.js";
import "./models/Teacher.js";

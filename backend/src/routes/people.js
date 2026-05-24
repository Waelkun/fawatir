const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  listPeople,
  createPerson,
  getPersonDetails,
  deletePerson,
  updatePerson
} = require('../controllers/people.controller');

router.use(authMiddleware);

router.get('/', listPeople);
router.post('/', createPerson);
router.get('/:id', getPersonDetails);
router.put('/:id', updatePerson);
router.delete('/:id', deletePerson);

module.exports = router;

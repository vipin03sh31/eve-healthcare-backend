const prisma = require('../config/database');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard include clause — always embed the active test offerings
 * (with test name/description) when returning a centre.
 */
const CENTRE_INCLUDE = {
  centreTests: {
    where: { isActive: true },
    include: {
      test: {
        select: { id: true, name: true, description: true, turnaround: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
};

/**
 * Shape the raw Prisma centre record into a clean response object.
 */
const formatCentre = (centre) => ({
  id: centre.id,
  name: centre.name,
  address: centre.address,
  city: centre.city,
  state: centre.state,
  pincode: centre.pincode,
  phone: centre.phone,
  email: centre.email,
  createdAt: centre.createdAt,
  updatedAt: centre.updatedAt,
  tests: centre.centreTests
    ? centre.centreTests.map((ct) => ({
        centreTestId: ct.id,
        testId: ct.test.id,
        name: ct.test.name,
        description: ct.test.description,
        turnaround: ct.test.turnaround,
        price: ct.price,
        isActive: ct.isActive,
      }))
    : undefined,
});

// ─────────────────────────────────────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new diagnostic centre.
 * @param {{ name, address, city, state, pincode, phone?, email? }} dto
 */
const createCentre = async ({ name, address, city, state, pincode, phone, email }) => {
  const centre = await prisma.diagnosticCentre.create({
    data: {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      phone: phone ? phone.trim() : null,
      email: email ? email.trim().toLowerCase() : null,
    },
    include: CENTRE_INCLUDE,
  });

  return formatCentre(centre);
};

/**
 * Return all diagnostic centres with their active test offerings.
 */
const getAllCentres = async () => {
  const centres = await prisma.diagnosticCentre.findMany({
    include: CENTRE_INCLUDE,
    orderBy: { name: 'asc' },
  });

  return centres.map(formatCentre);
};

/**
 * Return a single diagnostic centre by ID.
 * @throws {AppError} 404 if not found
 */
const getCentreById = async (id) => {
  const centre = await prisma.diagnosticCentre.findUnique({
    where: { id },
    include: CENTRE_INCLUDE,
  });

  if (!centre) {
    throw new AppError('Diagnostic centre not found.', 404);
  }

  return formatCentre(centre);
};

/**
 * Add a diagnostic test to a centre's offerings at a specific price.
 * @param {string} centreId
 * @param {{ testId, price }} dto
 * @throws {AppError} 404 if centre or test not found
 * @throws {AppError} 409 if the centre already offers this test
 */
const addTestToCentre = async (centreId, { testId, price }) => {
  // Verify centre exists
  const centre = await prisma.diagnosticCentre.findUnique({ where: { id: centreId } });
  if (!centre) throw new AppError('Diagnostic centre not found.', 404);

  // Verify test exists
  const test = await prisma.diagnosticTest.findUnique({ where: { id: testId } });
  if (!test) throw new AppError('Diagnostic test not found.', 404);

  // Create the CentreTest offering
  try {
    const centreTest = await prisma.centreTest.create({
      data: {
        centreId,
        testId,
        price: parseFloat(price),
      },
      include: {
        test: { select: { id: true, name: true, description: true, turnaround: true } },
        centre: { select: { id: true, name: true } },
      },
    });

    return {
      centreTestId: centreTest.id,
      centreId: centreTest.centreId,
      centreName: centreTest.centre.name,
      testId: centreTest.test.id,
      testName: centreTest.test.name,
      description: centreTest.test.description,
      turnaround: centreTest.test.turnaround,
      price: centreTest.price,
      isActive: centreTest.isActive,
      createdAt: centreTest.createdAt,
    };
  } catch (err) {
    // Prisma unique constraint: centre already offers this test
    if (err.code === 'P2002') {
      throw new AppError('This centre already offers the specified test.', 409);
    }
    throw err;
  }
};

module.exports = { createCentre, getAllCentres, getCentreById, addTestToCentre };

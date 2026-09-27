const prisma = require('../config/database');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape a raw DiagnosticTest record into a clean response object.
 * Optionally includes centre offerings (CentreTest rows).
 */
const formatTest = (test) => ({
  id: test.id,
  name: test.name,
  description: test.description,
  turnaround: test.turnaround,
  createdAt: test.createdAt,
  updatedAt: test.updatedAt,
  // Only present when centreTests are included (e.g. getTestById)
  availableAt: test.centreTests
    ? test.centreTests.map((ct) => ({
        centreTestId: ct.id,
        centreId: ct.centre.id,
        centreName: ct.centre.name,
        city: ct.centre.city,
        price: ct.price,
        isActive: ct.isActive,
      }))
    : undefined,
});

// ─────────────────────────────────────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new diagnostic test (global catalogue entry).
 * Price is NOT set here — it is set via addTestToCentre on a per-centre basis.
 *
 * @param {{ name, description?, turnaround? }} dto
 */
const createTest = async ({ name, description, turnaround }) => {
  const test = await prisma.diagnosticTest.create({
    data: {
      name: name.trim(),
      description: description ? description.trim() : null,
      turnaround: turnaround ? turnaround.trim() : null,
    },
  });

  return formatTest(test);
};

/**
 * Return all diagnostic tests (catalogue, no centre/price info).
 */
const getAllTests = async () => {
  const tests = await prisma.diagnosticTest.findMany({
    orderBy: { name: 'asc' },
  });

  return tests.map(formatTest);
};

/**
 * Return a single diagnostic test by ID, including which centres offer it.
 * @throws {AppError} 404 if not found
 */
const getTestById = async (id) => {
  const test = await prisma.diagnosticTest.findUnique({
    where: { id },
    include: {
      centreTests: {
        where: { isActive: true },
        include: {
          centre: { select: { id: true, name: true, city: true } },
        },
        orderBy: { price: 'asc' },
      },
    },
  });

  if (!test) {
    throw new AppError('Diagnostic test not found.', 404);
  }

  return formatTest(test);
};

module.exports = { createTest, getAllTests, getTestById };

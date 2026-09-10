import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement the object URL APIs; components that preview a
// selected File (e.g. the post photo picker) need at least a stub.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}

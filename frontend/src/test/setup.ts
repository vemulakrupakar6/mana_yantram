import * as matchers from "@testing-library/jest-dom/matchers";
import type {} from "@testing-library/jest-dom/vitest"; // matcher typings only; erased at runtime
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";

// Registered explicitly (rather than through the "@testing-library/jest-dom/vitest" side-effect
// import) so the matchers always attach to the same `expect` this test run is using.
expect.extend(matchers);
afterEach(cleanup);

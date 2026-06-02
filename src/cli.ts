import { ReviewAnnotation } from "./llm.js";

// ANSI escape codes for styling
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const GRAY = "\x1b[90m";
const GREEN = "\x1b[32m";

/**
 * Print review results beautifully in the console.
 */
export function printConsoleReview(annotations: ReviewAnnotation[]): void {
  console.log(`\n${BOLD}=== AI Code Review Results ===${RESET}\n`);

  if (annotations.length === 0) {
    console.log(`${GREEN}✔ No issues found. Looks good!${RESET}\n`);
    return;
  }

  const errors = annotations.filter(a => a.level === "error");
  const warnings = annotations.filter(a => a.level === "warning");
  const notices = annotations.filter(a => a.level === "notice");

  console.log(
    `Found ${BOLD}${annotations.length}${RESET} issue(s): ` +
    `${RED}${errors.length} error(s)${RESET}, ` +
    `${YELLOW}${warnings.length} warning(s)${RESET}, ` +
    `${BLUE}${notices.length} suggestion(s)${RESET}\n`
  );

  // Group by file for clean output
  const groupedByFile = annotations.reduce((acc, ann) => {
    if (!acc[ann.file]) acc[ann.file] = [];
    acc[ann.file].push(ann);
    return acc;
  }, {} as Record<string, ReviewAnnotation[]>);

  for (const [file, fileAnns] of Object.entries(groupedByFile)) {
    console.log(`${BOLD}${file}${RESET}`);
    
    // Sort by line number
    const sorted = [...fileAnns].sort((a, b) => a.line - b.line);

    for (const ann of sorted) {
      let badge = "";
      let color = "";
      
      if (ann.level === "error") {
        badge = " ✖ ERROR ";
        color = RED;
      } else if (ann.level === "warning") {
        badge = " ⚠ WARN  ";
        color = YELLOW;
      } else {
        badge = " ℹ INFO  ";
        color = BLUE;
      }

      console.log(
        `  ${color}${BOLD}${badge}${RESET} ` +
        `${GRAY}Line ${ann.line}:${RESET} ${ann.message}\n`
      );
    }
  }
}

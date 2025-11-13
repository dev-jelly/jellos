#!/bin/bash

# Diff Viewer Performance Benchmark Runner
# Runs performance benchmarks and generates reports

set -e

echo "=================================="
echo "Diff Viewer Performance Benchmarks"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to web app directory
cd "$(dirname "$0")/../../../../.."

echo "Current directory: $(pwd)"
echo ""

# Check if vitest is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}Error: npx not found. Please install Node.js${NC}"
    exit 1
fi

# Run benchmarks with memory profiling enabled
echo -e "${YELLOW}Running performance benchmarks...${NC}"
echo ""

# Run with --expose-gc for memory profiling
node --expose-gc ./node_modules/.bin/vitest run \
    components/diff/__tests__/performance/diff-viewer.performance.test.tsx \
    components/diff/__tests__/performance/memory-profiling.test.tsx \
    --reporter=verbose \
    2>&1 | tee benchmark-results.log

RESULT=$?

echo ""
echo "=================================="

if [ $RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ All benchmarks passed!${NC}"
    echo ""
    echo "Results saved to: benchmark-results.log"
else
    echo -e "${RED}✗ Some benchmarks failed${NC}"
    echo ""
    echo "Check benchmark-results.log for details"
    exit 1
fi

# Generate summary
echo ""
echo "Generating performance summary..."
echo ""

# Extract key metrics from log (if available)
if [ -f benchmark-results.log ]; then
    echo "=== Benchmark Summary ==="
    echo ""

    # Look for target spec results
    grep -A 10 "TARGET SPEC BENCHMARK" benchmark-results.log || echo "Target spec results not found"

    echo ""
    echo "=== Memory Analysis ==="
    grep -A 5 "Memory Scaling Analysis" benchmark-results.log || echo "Memory analysis not found"

    echo ""
    echo "Full results available in: benchmark-results.log"
fi

echo ""
echo "=================================="
echo -e "${GREEN}Benchmark run complete!${NC}"
echo "=================================="

default: build

# Install project dependencies using Soldeer package manager
install:
    @ echo "Installing dependencies..."
    forge soldeer install

# Build the smart contracts using Forge
build *FLAGS='':
    @ echo "Building contracts..."
    forge build {{ FLAGS }}

# Clean build artifacts
clean:
    @ echo "Cleaning build artifacts..."
    forge clean

# Lint the code using Forge
lint:
    @ echo "Linting code..."
    forge lint

# Run all tests using Forge
test *FLAGS='':
    @ echo "Running tests..."
    forge test {{ FLAGS }}

# Generate code coverage report excluding mocks, previous versions, tests, and scripts
coverage:
    @ echo "Running coverage with IR minimum..."
    FOUNDRY_PROFILE=coverage forge coverage --ir-minimum --report summary --report lcov --no-match-coverage "contracts/mocks/*|contracts/previousVersions/*|test|script"

# Format code (default: test & script files)
fmt paths='./test/forge/ ./script/forge/':
    @ echo "Formatting code..."
    forge fmt {{ paths }}

script script='' *FLAGS='':
    @ echo "Running script..."
    forge script {{ script }} {{ FLAGS }}

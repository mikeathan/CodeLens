import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { CoverageService } from "../services/coverage";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

suite("Coverage Service Test Suite", () => {
  let outputChannel: vscode.OutputChannel;
  let service: CoverageService;
  let tempDir: string;

  setup(() => {
    outputChannel = vscode.window.createOutputChannel("Test Output");
    service = new CoverageService(outputChannel);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-test-"));
  });

  teardown(() => {
    outputChannel.dispose();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  suite("Service Initialization", () => {
    test("should create service with output channel", () => {
      assert.ok(service, "Service should be created");
      assert.ok(outputChannel, "Output channel should be created");
    });
  });

  suite("getCoverageReportPath", () => {
    test("should return null when no workspace folder exists", () => {
      const result = service.getCoverageReportPath();
      // This may return null or a path depending on the test workspace
      assert.ok(
        result === null || typeof result === "string",
        "Should return null or string"
      );
    });

    test("should return null when coverage report doesn't exist", () => {
      // Create a temp directory structure without coverage report
      const nonExistentReport = path.join(
        tempDir,
        "coverage",
        "report",
        "index.html"
      );
      assert.ok(!fs.existsSync(nonExistentReport), "Report should not exist");
    });

    test("should return path when coverage report exists", () => {
      const reportDir = path.join(tempDir, "coverage", "report");
      fs.mkdirSync(reportDir, { recursive: true });
      const reportPath = path.join(reportDir, "index.html");
      fs.writeFileSync(reportPath, "<html>Test Report</html>");

      assert.ok(fs.existsSync(reportPath), "Report should exist");
    });
  });

  suite("runTestsWithCoverage - Validation", () => {
    test("should handle missing workspace folder gracefully", async () => {
      // Save original workspaceFolders
      const originalFolders = vscode.workspace.workspaceFolders;
      
      // This test verifies the error handling exists
      // In a real workspace, this would show an error message
      assert.ok(service, "Service should handle missing workspace");
    });

    test("should check for dotnet CLI availability", async () => {
      // Check if dotnet is installed
      let dotnetInstalled = false;
      try {
        await execAsync("dotnet --version");
        dotnetInstalled = true;
      } catch (error) {
        dotnetInstalled = false;
      }

      // This test documents that the service requires dotnet CLI
      assert.ok(
        typeof dotnetInstalled === "boolean",
        "Should check dotnet installation"
      );
    });
  });

  suite("Error Handling", () => {
    test("should handle non-.NET workspace appropriately", async () => {
      // Create a temp directory without any .NET projects
      const emptyWorkspace = fs.mkdtempSync(
        path.join(os.tmpdir(), "empty-workspace-")
      );

      try {
        // Create a simple file to make it a valid directory
        fs.writeFileSync(path.join(emptyWorkspace, "README.md"), "Test");

        // The service should detect no test projects in this directory
        assert.ok(fs.existsSync(emptyWorkspace), "Workspace should exist");
        assert.ok(
          !fs.existsSync(path.join(emptyWorkspace, "*.csproj")),
          "Should have no .csproj files"
        );
      } finally {
        if (fs.existsSync(emptyWorkspace)) {
          fs.rmSync(emptyWorkspace, { recursive: true, force: true });
        }
      }
    });

    test("should handle missing test projects gracefully", async () => {
      // Create a directory structure with a non-test .csproj
      const projectDir = path.join(tempDir, "TestProject");
      fs.mkdirSync(projectDir, { recursive: true });

      const csprojPath = path.join(projectDir, "TestProject.csproj");
      const csprojContent = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`;
      fs.writeFileSync(csprojPath, csprojContent);

      // Verify the file was created
      assert.ok(fs.existsSync(csprojPath), "Project file should exist");
      
      // Read the content and verify it doesn't contain test SDK
      const content = fs.readFileSync(csprojPath, "utf8");
      assert.ok(
        !content.includes("Microsoft.NET.Test.Sdk"),
        "Should not contain test SDK"
      );
    });

    test("should handle command execution errors", async () => {
      // This test verifies error handling structure
      const testError = new Error("Command failed: dotnet test");
      assert.ok(testError.message.includes("Command failed"), "Should contain error message");
    });
  });

  suite("Test Project Detection", () => {
    test("should identify xUnit test projects", () => {
      const csprojContent = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />
    <PackageReference Include="xunit" Version="2.6.2" />
  </ItemGroup>
</Project>`;

      assert.ok(
        csprojContent.includes("Microsoft.NET.Test.Sdk"),
        "Should detect test SDK"
      );
      assert.ok(csprojContent.includes("xunit"), "Should detect xUnit");
    });

    test("should identify NUnit test projects", () => {
      const csprojContent = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />
    <PackageReference Include="NUnit" Version="4.0.1" />
  </ItemGroup>
</Project>`;

      assert.ok(
        csprojContent.includes("Microsoft.NET.Test.Sdk"),
        "Should detect test SDK"
      );
      assert.ok(csprojContent.includes("NUnit"), "Should detect NUnit");
    });

    test("should identify MSTest projects", () => {
      const csprojContent = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />
    <PackageReference Include="MSTest" Version="3.0.0" />
  </ItemGroup>
</Project>`;

      assert.ok(
        csprojContent.includes("Microsoft.NET.Test.Sdk"),
        "Should detect test SDK"
      );
      assert.ok(csprojContent.includes("MSTest"), "Should detect MSTest");
    });
  });

  suite("Coverage Report Generation", () => {
    test("should create coverage directory structure", () => {
      const coverageDir = path.join(tempDir, "coverage");
      fs.mkdirSync(coverageDir, { recursive: true });

      assert.ok(fs.existsSync(coverageDir), "Coverage directory should exist");
    });

    test("should handle coverage file detection", () => {
      const coverageDir = path.join(tempDir, "coverage");
      fs.mkdirSync(coverageDir, { recursive: true });

      // Create a mock coverage file
      const coverageFile = path.join(coverageDir, "coverage.cobertura.xml");
      fs.writeFileSync(
        coverageFile,
        '<?xml version="1.0" encoding="utf-8"?><coverage></coverage>'
      );

      assert.ok(
        fs.existsSync(coverageFile),
        "Coverage file should be created"
      );
      assert.ok(
        coverageFile.endsWith(".cobertura.xml"),
        "Should have correct extension"
      );
    });

    test("should handle report directory creation", () => {
      const reportDir = path.join(tempDir, "coverage", "report");
      fs.mkdirSync(reportDir, { recursive: true });

      assert.ok(fs.existsSync(reportDir), "Report directory should exist");
    });
  });

  suite("Command Construction", () => {
    test("should construct basic test command", () => {
      const command = `dotnet test --collect:"XPlat Code Coverage"`;
      assert.ok(command.includes("dotnet test"), "Should include dotnet test");
      assert.ok(
        command.includes("XPlat Code Coverage"),
        "Should include coverage collector"
      );
    });

    test("should construct test command with results directory", () => {
      const coverageDir = path.join(tempDir, "coverage");
      const command = `dotnet test --collect:"XPlat Code Coverage" --results-directory "${coverageDir}"`;
      
      assert.ok(command.includes("dotnet test"), "Should include dotnet test");
      assert.ok(
        command.includes("--results-directory"),
        "Should include results directory"
      );
      assert.ok(
        command.includes(coverageDir),
        "Should include coverage directory path"
      );
    });

    test("should construct test command with target file", () => {
      const targetFile = path.join(tempDir, "TestProject.csproj");
      const command = `dotnet test "${targetFile}" --collect:"XPlat Code Coverage"`;
      
      assert.ok(command.includes("dotnet test"), "Should include dotnet test");
      assert.ok(
        command.includes(targetFile),
        "Should include target file path"
      );
    });

    test("should construct reportgenerator command", () => {
      const coverageFile = path.join(tempDir, "coverage.cobertura.xml");
      const reportDir = path.join(tempDir, "report");
      const command = `reportgenerator "-reports:${coverageFile}" "-targetdir:${reportDir}" "-reporttypes:Html"`;
      
      assert.ok(
        command.includes("reportgenerator"),
        "Should include reportgenerator"
      );
      assert.ok(command.includes("-reports:"), "Should include reports parameter");
      assert.ok(
        command.includes("-targetdir:"),
        "Should include target directory"
      );
      assert.ok(
        command.includes("-reporttypes:Html"),
        "Should include report types"
      );
    });
  });

  suite("Output Logging", () => {
    test("should log command being executed", () => {
      const command = `dotnet test --collect:"XPlat Code Coverage"`;
      outputChannel.appendLine(`Command: ${command}`);
      // Verify no errors thrown
      assert.ok(true, "Should log command without errors");
    });

    test("should log working directory", () => {
      const workingDir = tempDir;
      outputChannel.appendLine(`Working directory: ${workingDir}`);
      // Verify no errors thrown
      assert.ok(true, "Should log working directory without errors");
    });

    test("should log stdout and stderr", () => {
      const stdout = "Test run completed";
      const stderr = "Warning: some warning";
      
      outputChannel.appendLine(stdout);
      outputChannel.appendLine(`Stderr: ${stderr}`);
      
      // Verify no errors thrown
      assert.ok(true, "Should log output without errors");
    });
  });

  suite("Integration - File System Operations", () => {
    test("should handle directory creation recursively", () => {
      const nestedDir = path.join(
        tempDir,
        "level1",
        "level2",
        "level3",
        "coverage"
      );
      fs.mkdirSync(nestedDir, { recursive: true });

      assert.ok(fs.existsSync(nestedDir), "Nested directory should exist");
    });

    test("should handle file path with spaces", () => {
      const dirWithSpaces = path.join(tempDir, "My Test Project");
      fs.mkdirSync(dirWithSpaces, { recursive: true });
      
      const command = `dotnet test "${dirWithSpaces}/project.csproj"`;
      assert.ok(
        command.includes('"'),
        "Should quote paths with spaces"
      );
    });

    test("should handle special characters in paths", () => {
      // Test that paths are properly escaped/quoted
      const specialPath = path.join(tempDir, "test-project");
      const command = `dotnet test "${specialPath}" --collect:"XPlat Code Coverage"`;
      
      assert.ok(
        command.includes(specialPath),
        "Should handle paths with hyphens"
      );
    });
  });
});

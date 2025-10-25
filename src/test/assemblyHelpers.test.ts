import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  getReflectionScript,
  getProjectContent,
  getProgramContent,
  getBasicFileInfoMessage,
  cleanupTempFile,
  cleanupTempDir,
} from "../utils/assemblyHelpers";

suite("Assembly Helpers Test Suite", () => {
  const testAssemblyPath = "/path/to/test/assembly.dll";
  const windowsAssemblyPath = "C:\\path\\to\\test\\assembly.dll";

  suite("getReflectionScript", () => {
    test("should generate valid C# script with assembly path", () => {
      const script = getReflectionScript(testAssemblyPath);

      assert.ok(script.includes("using System;"), "Should include System namespace");
      assert.ok(script.includes("using System.Reflection;"), "Should include Reflection namespace");
      assert.ok(script.includes("Assembly.LoadFrom"), "Should load assembly");
      assert.ok(script.includes(testAssemblyPath), "Should include assembly path");
      assert.ok(script.includes("ASSEMBLY INFORMATION"), "Should have info section");
      assert.ok(script.includes("REFERENCED ASSEMBLIES"), "Should have references section");
      assert.ok(script.includes("EXPORTED TYPES"), "Should have types section");
      assert.ok(script.includes("CUSTOM ATTRIBUTES"), "Should have attributes section");
    });

    test("should escape backslashes for Windows paths", () => {
      const script = getReflectionScript(windowsAssemblyPath);

      assert.ok(script.includes("C:\\\\path\\\\to\\\\test\\\\assembly.dll"), "Should escape backslashes");
      assert.ok(!script.includes("C:\\path\\to"), "Should not contain single backslashes");
    });

    test("should handle error cases", () => {
      const script = getReflectionScript(testAssemblyPath);

      assert.ok(script.includes("try {"), "Should have try block");
      assert.ok(script.includes("catch (Exception ex)"), "Should have catch block");
      assert.ok(script.includes("Console.WriteLine($\"Error: {ex.Message}\")"), "Should log errors");
    });
  });

  suite("getProjectContent", () => {
    test("should generate valid .csproj content", () => {
      const content = getProjectContent();

      assert.ok(content.includes("<Project Sdk=\"Microsoft.NET.Sdk\">"), "Should have project SDK");
      assert.ok(content.includes("<OutputType>Exe</OutputType>"), "Should be executable");
      assert.ok(content.includes("<TargetFramework>net8.0</TargetFramework>"), "Should target .NET 8.0");
      assert.ok(content.includes("<Nullable>enable</Nullable>"), "Should enable nullable");
    });

    test("should be valid XML", () => {
      const content = getProjectContent();

      assert.ok(content.includes("</Project>"), "Should close Project tag");
      assert.ok(content.includes("</PropertyGroup>"), "Should close PropertyGroup tag");
    });
  });

  suite("getProgramContent", () => {
    test("should generate valid C# program with assembly path", () => {
      const program = getProgramContent(testAssemblyPath);

      assert.ok(program.includes("using System;"), "Should include System namespace");
      assert.ok(program.includes("using System.Reflection;"), "Should include Reflection namespace");
      assert.ok(program.includes("var assemblyPath = @\""), "Should declare assembly path variable");
      assert.ok(program.includes(testAssemblyPath), "Should include assembly path");
      assert.ok(program.includes("Assembly.LoadFrom(assemblyPath)"), "Should load assembly from variable");
    });

    test("should escape backslashes for Windows paths", () => {
      const program = getProgramContent(windowsAssemblyPath);

      assert.ok(program.includes("C:\\\\path\\\\to\\\\test\\\\assembly.dll"), "Should escape backslashes");
    });

    test("should include all analysis sections", () => {
      const program = getProgramContent(testAssemblyPath);

      assert.ok(program.includes("ASSEMBLY INFORMATION"), "Should have info section");
      assert.ok(program.includes("REFERENCED ASSEMBLIES"), "Should have references section");
      assert.ok(program.includes("EXPORTED TYPES (first 20)"), "Should have types section with limit");
      assert.ok(program.includes("CUSTOM ATTRIBUTES"), "Should have attributes section");
    });

    test("should handle types overflow", () => {
      const program = getProgramContent(testAssemblyPath);

      assert.ok(program.includes("if (totalTypes > 20)"), "Should check for overflow");
      assert.ok(program.includes("totalTypes - 20"), "Should calculate remaining types");
    });
  });

  suite("getBasicFileInfoMessage", () => {
    let tempFile: string;

    setup(() => {
      // Create a temporary file for testing
      const tempDir = os.tmpdir();
      tempFile = path.join(tempDir, "test_assembly.dll");
      fs.writeFileSync(tempFile, "fake assembly content");
    });

    teardown(() => {
      // Clean up temporary file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    test("should return basic file information", () => {
      const info = getBasicFileInfoMessage(tempFile);

      assert.ok(info.includes("test_assembly.dll"), "Should include filename");
      assert.ok(info.includes("Path:"), "Should include path label");
      assert.ok(info.includes("Size:"), "Should include size label");
      assert.ok(info.includes("bytes"), "Should include size unit");
      assert.ok(info.includes("Created:"), "Should include creation date");
      assert.ok(info.includes("Modified:"), "Should include modification date");
    });

    test("should include analysis failure explanation", () => {
      const info = getBasicFileInfoMessage(tempFile);

      assert.ok(info.includes("Could not load assembly"), "Should explain failure");
      assert.ok(info.includes("Missing dependencies"), "Should mention dependencies");
      assert.ok(info.includes("Different target framework"), "Should mention framework");
      assert.ok(info.includes("dotnet-script"), "Should suggest solution");
    });

    test("should format file size with locale", () => {
      const info = getBasicFileInfoMessage(tempFile);
      const stats = fs.statSync(tempFile);

      assert.ok(info.includes(stats.size.toLocaleString()), "Should format size with locale");
    });
  });

  suite("cleanupTempFile", () => {
    test("should delete existing file", () => {
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, "test_cleanup_file.txt");

      // Create file
      fs.writeFileSync(tempFile, "test content");
      assert.ok(fs.existsSync(tempFile), "File should exist before cleanup");

      // Cleanup
      cleanupTempFile(tempFile);
      assert.ok(!fs.existsSync(tempFile), "File should not exist after cleanup");
    });

    test("should not throw error for non-existent file", () => {
      const nonExistentFile = path.join(os.tmpdir(), "non_existent_file.txt");

      assert.doesNotThrow(() => {
        cleanupTempFile(nonExistentFile);
      }, "Should not throw error for non-existent file");
    });
  });

  suite("cleanupTempDir", () => {
    test("should delete existing directory with contents", () => {
      const tempDir = path.join(os.tmpdir(), "test_cleanup_dir");
      const nestedFile = path.join(tempDir, "nested_file.txt");

      // Create directory with file
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(nestedFile, "nested content");
      assert.ok(fs.existsSync(tempDir), "Directory should exist before cleanup");
      assert.ok(fs.existsSync(nestedFile), "File should exist before cleanup");

      // Cleanup
      cleanupTempDir(tempDir);
      assert.ok(!fs.existsSync(tempDir), "Directory should not exist after cleanup");
      assert.ok(!fs.existsSync(nestedFile), "Nested file should not exist after cleanup");
    });

    test("should not throw error for non-existent directory", () => {
      const nonExistentDir = path.join(os.tmpdir(), "non_existent_dir");

      assert.doesNotThrow(() => {
        cleanupTempDir(nonExistentDir);
      }, "Should not throw error for non-existent directory");
    });

    test("should handle nested directory structures", () => {
      const tempDir = path.join(os.tmpdir(), "test_nested_cleanup");
      const nestedDir = path.join(tempDir, "nested", "deep");

      // Create nested structure
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, "file.txt"), "content");
      assert.ok(fs.existsSync(nestedDir), "Nested directory should exist");

      // Cleanup
      cleanupTempDir(tempDir);
      assert.ok(!fs.existsSync(tempDir), "All nested directories should be removed");
    });
  });

  suite("Script Integration", () => {
    test("reflection script and program content should have same output structure", () => {
      const reflectionScript = getReflectionScript(testAssemblyPath);
      const programContent = getProgramContent(testAssemblyPath);

      // Both should have the same sections
      const sections = [
        "ASSEMBLY INFORMATION",
        "REFERENCED ASSEMBLIES",
        "CUSTOM ATTRIBUTES"
      ];

      sections.forEach(section => {
        assert.ok(reflectionScript.includes(section), `Reflection script should have ${section}`);
        assert.ok(programContent.includes(section), `Program content should have ${section}`);
      });
    });

    test("both scripts should handle errors consistently", () => {
      const reflectionScript = getReflectionScript(testAssemblyPath);
      const programContent = getProgramContent(testAssemblyPath);

      assert.ok(reflectionScript.includes("catch (Exception ex)"), "Reflection should catch exceptions");
      assert.ok(programContent.includes("catch (Exception ex)"), "Program should catch exceptions");
      assert.ok(reflectionScript.includes("ex.Message"), "Reflection should log message");
      assert.ok(programContent.includes("ex.Message"), "Program should log message");
    });
  });
});

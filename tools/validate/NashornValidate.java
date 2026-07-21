import org.openjdk.nashorn.api.scripting.NashornScriptEngineFactory;

import javax.script.Compilable;
import javax.script.ScriptEngine;
import javax.script.ScriptException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Dev-time validator for the Dragon-Mine-Z CustomNPCs scripts.
 *
 * These .js files run on Nashorn (ES5) inside a modded Minecraft server. This
 * harness loads the SAME engine the server uses and COMPILES each script (parse
 * + compile to bytecode) WITHOUT executing it. That validates ES5/Nashorn
 * syntax compatibility (e.g. it will reject let/const/arrow functions that would
 * break at runtime) without needing the DragonMineZ / CustomNPCs / Fabled
 * classes on the classpath, since top-level Java.type(...) calls only run on
 * eval(), not on compile().
 */
public class NashornValidate {
    public static void main(String[] args) throws IOException {
        List<Path> scripts = new ArrayList<>();
        if (args.length > 0) {
            for (String a : args) scripts.add(Paths.get(a));
        } else {
            Path root = Paths.get(".");
            Files.list(root)
                    .filter(p -> p.getFileName().toString().toLowerCase().endsWith(".js"))
                    .forEach(scripts::add);
        }
        Collections.sort(scripts);

        NashornScriptEngineFactory factory = new NashornScriptEngineFactory();
        ScriptEngine engine = factory.getScriptEngine("--language=es5");
        Compilable compilable = (Compilable) engine;

        int passed = 0;
        List<String> failures = new ArrayList<>();

        System.out.println("Nashorn engine: " + factory.getEngineName() + " " + factory.getEngineVersion()
                + " (language " + factory.getLanguageVersion() + ")");
        System.out.println("Validating " + scripts.size() + " script(s)...\n");

        for (Path p : scripts) {
            String name = p.getFileName().toString();
            try {
                String src = new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
                compilable.compile(src);
                System.out.println("  PASS  " + name);
                passed++;
            } catch (ScriptException e) {
                System.out.println("  FAIL  " + name + "  ->  " + e.getMessage());
                failures.add(name);
            }
        }

        System.out.println("\n---------------------------------------------");
        System.out.println("Result: " + passed + "/" + scripts.size() + " scripts compiled cleanly on Nashorn.");
        if (!failures.isEmpty()) {
            System.out.println("Failures: " + failures);
            System.exit(1);
        }
        System.out.println("All scripts are Nashorn/ES5-compatible.");
    }
}

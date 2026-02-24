const { spawn } = require("child_process");
const path = require("path");

/**
 * Cognition Bridge - Calls the DSPy agent
 * @param {string} query 
 * @param {string} history 
 * @returns {Promise<{plan: string, answer: string}>}
 */
async function callCognitionAgent(query, history = "") {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python", [
            path.join(__dirname, "..", "cognition", "dspy_agent.py"),
            query,
            history
        ], {
            env: { ...process.env, PYTHONUNBUFFERED: "1" }
        });

        let output = "";
        let error = "";

        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            error += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(`DSPy agent exited with code ${code}: ${error}`));
            }

            // Parsing output (naive parsing for now, looking for markers)
            const planMatch = output.match(/--- AGENT PLAN ---\n([\s\S]*?)\n--- AGENT ANSWER ---/);
            const answerMatch = output.match(/--- AGENT ANSWER ---\n([\s\S]*)/);

            if (planMatch && answerMatch) {
                resolve({
                    plan: planMatch[1].trim(),
                    answer: answerMatch[1].trim()
                });
            } else {
                // If marks are missing, return whole output as answer
                resolve({
                    plan: "No specific plan extracted.",
                    answer: output.trim()
                });
            }
        });

        // Input handling if needed later
        // pythonProcess.stdin.write(JSON.stringify({ query, history }));
        // pythonProcess.stdin.end();
    });
}

module.exports = { callCognitionAgent };

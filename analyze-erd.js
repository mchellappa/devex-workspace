"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
async function analyzeERD() {
    const imagePath = path.join(__dirname, '..', 'examples', 'Swift_ODS_Datamodel', 'transactions.png');
    const imageBuffer = fs.readFileSync(imagePath);
    // Keep as Uint8Array for LanguageModelDataPart
    // Find a suitable language model
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4'
    });
    if (models.length === 0) {
        console.error('No suitable vision model found');
        return;
    }
    const model = models[0];
    const prompt = `Analyze this Entity Relationship Diagram (ERD) for a retirement platform domain.

Extract the following information in a structured format:

1. **Entity Names**: List all entities/tables shown in the diagram
2. **For each entity, extract:**
   - Entity name
   - All field names (columns) with their data types
   - Primary key field(s)
   - Foreign key field(s) and what they reference
3. **Relationships**: 
   - Between which entities
   - Cardinality (one-to-one, one-to-many, many-to-many)
4. **Constraints**: Any unique constraints, check constraints, or business rules visible

Please provide the information in a clear, structured format that can be used to generate:
- SQL DDL statements
- OpenAPI schemas
- JPA entity classes

Focus on accuracy - extract EXACTLY what you see in the diagram.`;
    const messages = [
        vscode.LanguageModelChatMessage.User([
            prompt,
            new vscode.LanguageModelDataPart(imageBuffer, 'image/png')
        ])
    ];
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    let fullResponse = '';
    for await (const chunk of response.text) {
        fullResponse += chunk;
    }
    console.log('=== ERD ANALYSIS ===');
    console.log(fullResponse);
    console.log('=== END ANALYSIS ===');
    // Write to file
    const outputPath = path.join(__dirname, '..', 'examples', 'transactions-erd-analysis.txt');
    fs.writeFileSync(outputPath, fullResponse);
    console.log(`\nAnalysis saved to: ${outputPath}`);
}
analyzeERD().catch(console.error);
//# sourceMappingURL=analyze-erd.js.map
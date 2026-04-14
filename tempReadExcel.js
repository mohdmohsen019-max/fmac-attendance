import xlsx from 'xlsx';
import fs from 'fs';

try {
  const filePath = 'C:\\Users\\HP\\Desktop\\Players Data (13).xlsx';
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log("Headers:", data[0]);
  console.log("Row 1:", data[1]);
  
  fs.writeFileSync('public/cleaned_players.json', JSON.stringify(xlsx.utils.sheet_to_json(sheet)));
  console.log("Wrote JSON to public/cleaned_players.json");
} catch (error) {
  console.error("Error:", error);
}

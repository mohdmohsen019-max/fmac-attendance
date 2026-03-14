import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xlsx = require('xlsx');
const fs = require('fs');

try {
  const filePath = 'C:\\Users\\97154\\Desktop\\FMAC Attenndance Tracker.xlsx';
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const data = xlsx.utils.sheet_to_json(sheet);
  
  const mappedData = data.map((row) => {
    
    // Formatting the time nicely
    let fromTime = row['Training From Time'] || '';
    let toTime = row['Training To Time'] || '';
    
    // Sometimes Excel stores times as decimals, let's keep it simple for now or pass as strings
    let classTiming = (fromTime || toTime) ? `${fromTime} - ${toTime}` : 'N/A';
    
    // If Excel times come in as decimals (like 0.666), xlsx.utils.format_cell might be better
    // But assuming they are strings or standard
    return {
      id: row['ID'] || `FMAC-${Math.floor(Math.random() * 10000)}`,
      name: row['Name'] || 'Unknown Name',
      sport: row['Sports'] || 'N/A',
      classTiming,
      coach: row['Coach Name'] || 'N/A'
    };
  });

  const fileContent = `export const mockPlayers = ${JSON.stringify(mappedData, null, 2)};\n`;
  fs.writeFileSync('./src/dataMock.js', fileContent);
  console.log(`Successfully mapped ${mappedData.length} players using exact column names.`);
} catch (error) {
  console.error("Error parsing the Excel file:", error);
}

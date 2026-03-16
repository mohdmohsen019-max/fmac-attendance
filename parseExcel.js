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
    
    // Helper to convert Excel decimal time (e.g. 0.6875) to "04:30 PM"
    const convertExcelTime = (val) => {
      if (val === undefined || val === null || val === '') return '';
      if (typeof val === 'string' && val.includes(':')) return val.trim(); // already a string
      const totalMinutes = Math.round(parseFloat(val) * 24 * 60);
      const hours24 = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      const period = hours24 >= 12 ? 'PM' : 'AM';
      const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
      return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
    };

    let fromTime = convertExcelTime(row['Training From Time']);
    let toTime = convertExcelTime(row['Training To Time']);
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

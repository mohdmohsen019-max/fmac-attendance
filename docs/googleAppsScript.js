function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var headers = ["Date", "Player ID", "Name", "Sport", "Coach", "Status"];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  try {
    var data = JSON.parse(e.postData.contents);
    var dateString = new Date().toLocaleDateString();

    var rows = data.map(function (player) {
      return [
        dateString,
        player.id,
        player.name,
        player.sport,
        player.coach,
        player.status
      ];
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return ContentService.createTextOutput(JSON.stringify({ "result": "success", "message": data.length + " logs added." }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Allows CORS preflight requests
function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(headers);
}

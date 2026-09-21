// ============================================================
// SETUP: 1) Paste your Google Doc template ID below
//        2) (Optional) Put a Drive folder ID below to store generated copies
// ============================================================
var TEMPLATE_DOC_ID = '161bxWQTU7IyHvqgTZNsduBZtfqrY4owuxIk0JHhh5ek';
var OUTPUT_FOLDER_ID = ''; // optional

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.data) {
      var formData = JSON.parse(e.parameter.data);
      var result = generateRoleMappingForm(formData);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'K2 Role Mapping API is running' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function generateRoleMappingForm(formData) {
  if (!TEMPLATE_DOC_ID || TEMPLATE_DOC_ID.indexOf('PUT_YOUR') === 0) {
    throw new Error('TEMPLATE_DOC_ID ಅನ್ನು code.gs ಫೈಲ್‌ನಲ್ಲಿ ಹೊಂದಿಸಿ.');
  }

  var roles = Array.isArray(formData.role)
    ? formData.role
    : (formData.role ? [formData.role] : []);

  if (roles.length === 0) {
    throw new Error('ಕನಿಷ್ಠ ಒಂದು ರೋಲ್ ಆಯ್ಕೆ ಮಾಡಿ.');
  }

  var templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
  var folder = OUTPUT_FOLDER_ID
    ? DriveApp.getFolderById(OUTPUT_FOLDER_ID)
    : (templateFile.getParents().hasNext() ? templateFile.getParents().next() : DriveApp.getRootFolder());

  var copyName = 'K2RoleMapping_' + (formData.chargeename || 'output') + '_' + new Date().getTime() + '_' + Utilities.getUuid();
  var copyFile = templateFile.makeCopy(copyName, folder);

  try {
    var doc = DocumentApp.openById(copyFile.getId());
    var body = doc.getBody();

    // Mapping all possible variations across template pages
    var aliasGroups = [
      [formData.treasury, ['{treasury}']],
      [formData.transfereename, ['{transfereename}']],
      [formData.transfereekgid, ['{transfereekgid}']],
      [formData.transferedesignation, ['{transferedesignation}']],
      [formData.reason, ['{reason}']],
      [formData.govtorder, ['{govtorder}', '{GovtOrder}']],
      [formData.govtorderdate, ['{govtorderdate}', '{GovtOrderdate}']],
      [formData.inchargeorder, ['{inchargeorder}']],
      [formData.officeorder, ['{officeorder}', '{officeOrder}', '{officeorderno}']],
      [formData.officeorderdate, ['{officeorderdate}', '{officeOrderdate}']],
      [formData.institution, ['{institution}']],
      [formData.k1code, ['{k1code}']],
      [formData.k2code, ['{k2code}']],
      [formData.chargeename, ['{chargeename}']],
      [formData.chargeekgid, ['{chargeekgid}', '{chargeekigid}', '{chargekgidno}']],
      [formData.chargeeprimarydesignation, ['{chargeeprimarydesignation}']],
      [formData.chargeesecondarydesignation, ['{chargeesecondarydesignation}', '{chargeedesignation}']],
      [formData.chargeemobile, ['{chargeemobile}']]
    ];

    aliasGroups.forEach(function (group) {
      var value = group[0] || '';
      var tokens = group[1];
      tokens.forEach(function (token) {
        replaceAndBoldAllMatches(body, token, value);
      });
    });

    removeAllPageBreaks(body);
    insertPageBreaksAtMarkers(body, '{PAGEBREAK}');
    fillRoleTable(body, formData, roles);

    doc.saveAndClose();

    var pdfBlob = DriveApp.getFileById(copyFile.getId()).getAs('application/pdf');
    var base64 = Utilities.base64Encode(pdfBlob.getBytes());
    var fileName = copyName + '.pdf';

    return {
      pdfBase64: base64,
      fileName: fileName
    };
  } finally {
    DriveApp.getFileById(copyFile.getId()).setTrashed(true);
  }
}

/**
 * Replaces placeholders case-insensitively and forces both BOLD weight and 
 * 'Noto Sans Kannada' font family so Indic characters render bold in PDF output.
 */
function replaceAndBoldAllMatches(body, rawToken, value) {
  var pattern = '(?i)' + escapeForRegex(rawToken);
  var found = body.findText(pattern);

  while (found) {
    var textElement = found.getElement().asText();
    var start = found.getStartOffset();
    var endInclusive = found.getEndOffsetInclusive();

    if (value && value.length > 0) {
      textElement.insertText(start, value);
      
      var boldEnd = start + value.length - 1;
      textElement.setBold(start, boldEnd, true);
      // Explicitly apply a Kannada-supporting font to ensure bold weight applies to Indic script
      textElement.setFontFamily(start, boldEnd, 'Noto Sans Kannada');

      var newStart = start + value.length;
      var newEnd = endInclusive + value.length;
      textElement.deleteText(newStart, newEnd);
    } else {
      textElement.deleteText(start, endInclusive);
    }

    found = body.findText(pattern);
  }
}

function fillRoleTable(body, formData, roles) {
  var tables = body.getTables();
  if (tables.length === 0) return;
  var table = tables[0];

  var dataRowCount = table.getNumRows() - 1;

  while (dataRowCount < roles.length) {
    table.appendTableRow(table.getRow(1).copy());
    dataRowCount++;
  }
  while (dataRowCount > roles.length) {
    table.removeRow(table.getNumRows() - 1);
    dataRowCount--;
  }

  for (var i = 0; i < roles.length; i++) {
    var row = table.getRow(i + 1);
    setCellText(row.getCell(0), String(i + 1), false);
    setCellText(row.getCell(1), formData.chargeename || '', true);
    setCellText(row.getCell(2), formData.chargeekgid || '', true);
    setCellText(row.getCell(3), formData.k2code || '', true);
    setCellText(row.getCell(4), roles[i], true);
  }
}

function setCellText(cell, value, bold) {
  var text = cell.editAsText();
  text.setText(value);
  if (value.length > 0) {
    if (bold) {
      text.setBold(0, value.length - 1, true);
      text.setFontFamily(0, value.length - 1, 'Noto Sans Kannada');
    } else {
      text.setBold(0, value.length - 1, false);
    }
  }
}

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeAllPageBreaks(body) {
  for (var i = body.getNumChildren() - 1; i >= 0; i--) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PAGE_BREAK) {
      body.removeChild(child);
    } else if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var para = child.asParagraph();
      for (var j = para.getNumChildren() - 1; j >= 0; j--) {
        if (para.getChild(j).getType() === DocumentApp.ElementType.PAGE_BREAK) {
          para.removeChild(para.getChild(j));
        }
      }
    }
  }
}

function insertPageBreaksAtMarkers(body, marker) {
  marker = (marker || '{PAGEBREAK}').toLowerCase();
  var paras = body.getParagraphs();
  for (var i = 0; i < paras.length; i++) {
    var para = paras[i];
    if (para.getText().toLowerCase().indexOf(marker) !== -1) {
      var idx = body.getChildIndex(para);
      body.insertPageBreak(idx);
      para.removeFromParent();
    }
  }
}
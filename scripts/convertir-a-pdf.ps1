# Convierte a PDF un documento de Office usando la aplicación instalada.
#
# Se usa cuando no hay LibreOffice: en los equipos del SERFOR hay Word, y es el
# único convertidor que respeta de verdad el formato del documento —membretes,
# tablas, firmas insertadas—, que es lo que el revisor necesita ver.
#
# Uso: powershell -NoProfile -NonInteractive -File convertir-a-pdf.ps1 -Origen <ruta> -Destino <ruta>

param(
  [Parameter(Mandatory = $true)][string]$Origen,
  [Parameter(Mandatory = $true)][string]$Destino
)

$ErrorActionPreference = 'Stop'

# 17 = wdFormatPDF en Word; 0 = xlTypePDF en Excel.
$WD_FORMATO_PDF = 17
$XL_TIPO_PDF = 0

$extension = [System.IO.Path]::GetExtension($Origen).ToLowerInvariant()
$app = $null
$documento = $null

try {
  if ($extension -eq '.doc' -or $extension -eq '.docx') {
    $app = New-Object -ComObject Word.Application
    $app.Visible = $false
    $app.DisplayAlerts = 0
    # Deshabilita las macros del documento: convertir no debe ejecutar nada.
    $app.AutomationSecurity = 3
    # Abre en solo lectura y sin pedir confirmación de conversión.
    $documento = $app.Documents.Open($Origen, $false, $true)
    $documento.ExportAsFixedFormat($Destino, $WD_FORMATO_PDF)
  }
  elseif ($extension -eq '.xls' -or $extension -eq '.xlsx') {
    $app = New-Object -ComObject Excel.Application
    $app.Visible = $false
    $app.DisplayAlerts = $false
    $app.AutomationSecurity = 3
    $documento = $app.Workbooks.Open($Origen, 0, $true)
    $documento.ExportAsFixedFormat($XL_TIPO_PDF, $Destino)
  }
  else {
    Write-Error "No hay convertidor para la extensión $extension."
    exit 2
  }

  exit 0
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
finally {
  if ($documento) {
    try { $documento.Close(0) } catch { }
  }
  if ($app) {
    try { $app.Quit() } catch { }
  }
}

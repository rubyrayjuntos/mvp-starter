#!/usr/bin/env bash
set -euo pipefail
mkdir -p $(dirname "$0")/../samples
cd $(dirname "$0")/../samples

curl -L -o Baker-Sample_Report.pdf "https://npiweb.com/waco/wp-content/uploads/sites/9/2025/02/Baker-Sample_Report.pdf"
curl -L -o TLC-Sample-Home-Inspection-Report-24.pdf "https://tlcinspectors.com/wp-content/uploads/2024/01/TLC-Sample-Home-Inspection-Report-24.pdf.pdf"
curl -L -o Homebuyers-Residential-Sample.pdf "https://npiweb.com/frisco/wp-content/uploads/sites/92/2025/04/Homebuyers-Residential-Sample.pdf"
curl -L -o Newer-Home-Sample-Report.pdf "https://rodinspects.com/wp-content/uploads/2017/10/Newer-Home-Sample-Report.pdf"
curl -L -o Condo-inspection.pdf "https://nunnalleeinspections.com/wp-content/uploads/2021/03/Condo-inspection.pdf"
curl -L -o Pre-Pour-Sample.pdf "https://www.texasinspector.com/files/Pre-Pour-Sample.pdf"

# Save some web pages that link to additional examples
curl -L -o rei-specialist-samples.html "https://www.rei-specialist.com/sample_inspection_reports"
curl -L -o adinspect-samples.html "https://www.adinspectionstx.com/property-inspection-report/"
curl -L -o nachi-samples.html "https://www.nachi.org/home-inspection-report-samples.htm"

echo "Finished downloading sample files into ../samples"

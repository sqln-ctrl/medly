Medly is a medicine reminder app.
## Prescription photo import
On iOS and Android, the Medications tab can read a prescription photo using on-device text recognition. Photos are not sent to the backend. OCR text and suggested times must be checked against the prescription; the schedule remains inactive until it is reviewed and confirmed. The import flow handles one medication at a time and creates daily schedules with up to three reminder times.
The OCR library is a native module and is not available in Expo Go. Run a native development build after installing dependencies (for example, `npx expo run:android` or `npx expo run:ios`). Text recognition is not available on web.

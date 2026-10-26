import TextRecognition from '@react-native-ml-kit/text-recognition';

export async function readPrescription(imageUri: string): Promise<string> {
  const result = await TextRecognition.recognize(imageUri);
  const text = result.text.trim();
  if (!text) {
    throw new Error('No text could be read. Try a clearer, well-lit photo.');
  }
  return text;
}

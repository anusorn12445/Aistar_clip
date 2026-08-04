import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `คุณคือผู้เชี่ยวชาญวิเคราะห์คาแรคเตอร์สำหรับ AI Talent
วิเคราะห์บุคคลในรูปภาพ แล้วตอบเป็น JSON เท่านั้น (ห้ามมี markdown ห้ามมีข้อความอื่น)
เขียนค่าเป็นภาษาไทย ยกเว้น technical terms (lens, quality tags, negative prompt) เป็นอังกฤษ

โครงสร้าง JSON:
{
  "persona": {
    "fear": "", "dream": "", "weakness": "", "backstory": "",
    "shortBio": "", "motivation": "", "humorStyle": "", "personality": "",
    "catchphrases": "", "languageStyle": "", "oneLineConcept": ""
  },
  "visualDna": {
    "eyes": "", "lens": "85mm portrait lens", "lips": "", "mood": "", "nose": "",
    "posture": "", "eyebrows": "", "lighting": "", "artStyle": "photorealistic",
    "bodyType": "", "ethnicity": "", "shotType": "", "skinTone": "", "faceShape": "",
    "hairStyle": "", "colorGrade": "", "aspectRatio": "3:4", "cameraAngle": "",
    "makeupStyle": "",
    "qualityTags": "8k · sharp focus · high detail · natural skin texture · professional portrait",
    "colorPalette": "", "fashionStyle": "", "depthOfField": "shallow depth of field, blurred background",
    "negativePrompt": "cartoon, anime, illustration, 3d render, plastic skin, over-smoothed skin, extra fingers, deformed hands, blurry face, distorted features, watermark, text, logo, oversaturated, harsh shadows, duplicate face, low resolution, teenager, child",
    "antiCloneRules": "", "heightImpression": "", "backgroundSetting": "", "distinctiveFeatures": ""
  },
  "commerceProfile": {
    "audienceFit": "", "productFit": "", "sellingAngle": "", "trustFactor": ""
  },
  "voiceProfile": { "tone": "", "accent": "", "voiceType": "" }
}

กติกา:
- persona: สร้างจากบุคลิกที่อ่านได้จากรูป (วัย สีหน้า การแต่งกาย ท่าทาง) ให้สอดคล้องกันเป็นตัวละครเดียว
- visualDna: บรรยายจากสิ่งที่เห็นจริงในรูปเท่านั้น ละเอียดพอใช้ lock อัตลักษณ์ใน Veo/Flow ได้
- antiCloneRules: เขียนกฎกันหลุดอัตลักษณ์เฉพาะของคนในรูป (ใบหน้า ผม เสื้อผ้า) และย้ำห้ามอ้างอิงบุคคลจริงหรือ IP ใด ๆ
- commerceProfile: ประเมินกลุ่มลูกค้า/สินค้าที่เหมาะกับคาแรคเตอร์นี้บนแพลตฟอร์ม e-commerce ไทย
- voiceProfile: เดาโทนเสียงที่เข้ากับวัยและบุคลิกในรูป`;

export interface CharacterAnalysisResult {
  persona: Record<string, string>;
  visualDna: Record<string, string>;
  commerceProfile: Record<string, string>;
  voiceProfile: Record<string, string>;
}

@Injectable()
export class CharacterVisionService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async analyzeFromImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<CharacterAnalysisResult> {
    try {
      const res = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'วิเคราะห์คาแรคเตอร์จากรูปนี้เป็น Character Bible JSON',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      });

      const raw = res.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw) as CharacterAnalysisResult;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new InternalServerErrorException(
          'AI ตอบกลับในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่',
        );
      }
      throw new InternalServerErrorException(
        'เรียก OpenAI ไม่สำเร็จ: ' + (err as Error).message,
      );
    }
  }
}

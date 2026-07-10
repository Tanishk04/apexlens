import { isTextChatModel, type OpenRouterModel } from '../ai/models';

const m = (id: string, architecture?: OpenRouterModel['architecture']): OpenRouterModel => ({
  id,
  architecture,
});

describe('isTextChatModel (OpenRouter filter)', () => {
  it('keeps text->text chat models', () => {
    expect(
      isTextChatModel(m('a', { input_modalities: ['text'], output_modalities: ['text'] })),
    ).toBe(true);
    expect(isTextChatModel(m('b', { modality: 'text->text' }))).toBe(true);
  });

  it('keeps multimodal-input models that still output text (vision)', () => {
    expect(
      isTextChatModel(m('c', { input_modalities: ['text', 'image'], output_modalities: ['text'] })),
    ).toBe(true);
    expect(isTextChatModel(m('d', { modality: 'text+image->text' }))).toBe(true);
  });

  it('drops image-generation and audio/TTS models', () => {
    expect(
      isTextChatModel(m('e', { input_modalities: ['text'], output_modalities: ['image'] })),
    ).toBe(false);
    expect(isTextChatModel(m('f', { modality: 'text->image' }))).toBe(false);
    expect(
      isTextChatModel(m('g', { input_modalities: ['text'], output_modalities: ['audio'] })),
    ).toBe(false);
  });

  it('drops models that emit BOTH text and images (e.g. Gemini flash image)', () => {
    expect(
      isTextChatModel(
        m('j', { input_modalities: ['text'], output_modalities: ['text', 'image'] }),
      ),
    ).toBe(false);
    expect(isTextChatModel(m('k', { modality: 'text+image->text+image' }))).toBe(false);
  });

  it('keeps models with no architecture info (tolerant)', () => {
    expect(isTextChatModel(m('h'))).toBe(true);
    expect(isTextChatModel(m('i', {}))).toBe(true);
  });
});

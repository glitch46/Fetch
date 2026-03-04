// AI Prompt Generation Service — owned by Mobile Agent (implementation)
// Generates personality prompts for dog profiles using Anthropic API

import type { Dog } from '@fetch/shared';
import Constants from 'expo-constants';

interface DogPrompt {
  prompt: string;
  response: string;
}

const UNIVERSAL_PROMPTS = [
  'If I could tell my future family one thing, it would be...',
  'My perfect day looks like...',
  'The way to my heart is...',
  "What I'm looking for in a home...",
  'My friends would describe me as...',
];

const TAG_PROMPTS: Record<string, string[]> = {
  playful: [
    'My favorite game to play is...',
    'You know I\'m having fun when...',
  ],
  cuddler: [
    'My ideal cuddle position is...',
    'The best spot for belly rubs is...',
  ],
  active_lifestyle: [
    'My dream adventure would be...',
    'I never get tired of...',
  ],
  laid_back: [
    'My favorite napping spot is...',
    'The secret to relaxation is...',
  ],
  housetrained: [
    'I\'m proudest of myself for...',
  ],
  knows_tricks: [
    'My best trick is...',
    'The treat that motivates me most is...',
  ],
  loves_the_water: [
    'My favorite water activity is...',
  ],
  loves_car_rides: [
    'My favorite thing about car rides is...',
  ],
};

export function selectPromptsForDog(dog: Dog): string[] {
  // Pick 2 universal prompts
  const shuffledUniversal = [...UNIVERSAL_PROMPTS].sort(() => Math.random() - 0.5);
  const selected = shuffledUniversal.slice(0, 2);

  // Pick 1 tag-specific prompt
  const matchingTagPrompts: string[] = [];
  for (const tag of dog.tags || []) {
    const tagKey = tag.toLowerCase().replace(/\s+/g, '_');
    if (TAG_PROMPTS[tagKey]) {
      matchingTagPrompts.push(...TAG_PROMPTS[tagKey]);
    }
  }

  // Also check matched_preferences
  for (const pref of dog.matched_preferences || []) {
    if (TAG_PROMPTS[pref]) {
      matchingTagPrompts.push(...TAG_PROMPTS[pref]);
    }
  }

  if (matchingTagPrompts.length > 0) {
    const shuffled = matchingTagPrompts.sort(() => Math.random() - 0.5);
    selected.push(shuffled[0]);
  } else {
    // Fallback to a third universal prompt
    selected.push(shuffledUniversal[2] || UNIVERSAL_PROMPTS[0]);
  }

  return selected;
}

export async function generateDogPrompts(dog: Dog): Promise<DogPrompt[]> {
  // Return cached prompts if available
  if (dog.prompts && dog.prompts.length > 0) {
    return dog.prompts;
  }

  const prompts = selectPromptsForDog(dog);
  const apiKey = Constants.expoConfig?.extra?.anthropicApiKey;

  if (!apiKey) {
    // Fallback: generate simple responses without API
    return generateFallbackPrompts(dog, prompts);
  }

  try {
    const dogDescription = [
      `Name: ${dog.name}`,
      `Breed: ${dog.breed_primary || 'Mixed Breed'}${dog.breed_secondary ? ` / ${dog.breed_secondary}` : ''}`,
      `Age: ${dog.age}`,
      `Size: ${dog.size}`,
      `Gender: ${dog.gender}`,
      dog.description ? `Bio: ${dog.description}` : '',
      dog.tags?.length ? `Personality traits: ${dog.tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: `You are writing first-person personality responses for a shelter dog's dating-app-style profile. Be warm, playful, and endearing. Each response should be 1-2 sentences, written as if the dog is speaking. Keep it lighthearted and adoption-friendly. Return ONLY a JSON array of objects with "prompt" and "response" fields.`,
        messages: [
          {
            role: 'user',
            content: `Here is the dog's info:\n${dogDescription}\n\nWrite responses for these prompts:\n${prompts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return generateFallbackPrompts(dog, prompts);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as DogPrompt[];
      return parsed;
    }

    return generateFallbackPrompts(dog, prompts);
  } catch {
    return generateFallbackPrompts(dog, prompts);
  }
}

function generateFallbackPrompts(dog: Dog, prompts: string[]): DogPrompt[] {
  const name = dog.name;
  const breed = dog.breed_primary || 'pup';

  const fallbackResponses: Record<string, string> = {
    'If I could tell my future family one thing, it would be...':
      `I've got so much love to give! This ${breed} heart is ready for a forever home.`,
    'My perfect day looks like...':
      `Walks in the park, belly rubs, and snuggling up with my favorite person. Simple joys!`,
    'The way to my heart is...':
      `Treats, patience, and maybe a squeaky toy or two. I'm easy to please!`,
    "What I'm looking for in a home...":
      `Someone who'll give ${name} lots of love, a comfy spot, and plenty of adventures.`,
    'My friends would describe me as...':
      `The life of the party! Well, a very cute and lovable party guest at least.`,
  };

  return prompts.map((prompt) => ({
    prompt,
    response: fallbackResponses[prompt] || `Hi, I'm ${name}! I can't wait to meet you and show you how special I am.`,
  }));
}

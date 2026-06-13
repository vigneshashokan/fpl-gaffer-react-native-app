// src/__tests__/components/confirmPitch.test.tsx
import { render } from '@testing-library/react-native';
import { ConfirmPitch } from '@/components/connect-team/ConfirmPitch';
import type { Preview, PreviewPlayer } from '@/api/teamPreview';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function p(name: string, club: 'ARS' | 'MCI' | 'MUN' | 'CHE' | 'TOT' | 'NEW' | 'AVL' | 'LIV' | 'BOU' | 'BRE' | 'CRY' | 'NFO', flags: Partial<PreviewPlayer> = {}): PreviewPlayer {
  return { name, club, ...flags };
}

const PREVIEW: Preview = {
  teamName: 'Apex Pitch FC',
  managerName: 'Vignesh A.',
  rank: 0, totalPoints: 0, captainName: 'Haaland',
  starters: [
    p('Raya', 'ARS'),
    p('Gabriel', 'ARS'),
    p('Trippier', 'NEW'),
    p('Senesi', 'BOU'),
    p('Doku', 'MCI'),
    p('B.Fernandes', 'MUN'),
    p('Saka', 'ARS', { vice: true }),
    p('Palmer', 'CHE'),
    p('Haaland', 'MCI', { capt: true }),
    p('Watkins', 'AVL'),
    p('Solanke', 'TOT'),
  ],
  bench: [
    p('Henderson', 'CRY'),
    p('Truffert', 'BOU'),
    p('O.Dango', 'BRE'),
    p('Lacroix', 'CRY'),
  ],
};

describe('<ConfirmPitch />', () => {
  it('renders every starter and bench name', () => {
    const { getByText } = render(<ConfirmPitch preview={PREVIEW} />);
    for (const player of [...PREVIEW.starters, ...PREVIEW.bench]) {
      expect(getByText(player.name)).toBeTruthy();
    }
  });

  it('renders the vice badge next to the vice captain', () => {
    const { getAllByText } = render(<ConfirmPitch preview={PREVIEW} />);
    expect(getAllByText('V').length).toBeGreaterThan(0);
  });

  it('handles partial squads (5 starters, 0 bench) without crashing', () => {
    const partial: Preview = {
      ...PREVIEW,
      starters: PREVIEW.starters.slice(0, 5),
      bench: [],
    };
    const { getByText } = render(<ConfirmPitch preview={partial} />);
    expect(getByText('Raya')).toBeTruthy();
  });
});

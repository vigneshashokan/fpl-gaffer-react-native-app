import { SQUAD, TOP_PICKS, CHIPS, CLUBS, APEX_TEAM, TEAM_INFO } from '../constants/data';

describe('SQUAD', () => {
  it('has exactly 11 starters', () => {
    expect(SQUAD.starters).toHaveLength(11);
  });

  it('has exactly 4 bench players', () => {
    expect(SQUAD.bench).toHaveLength(4);
  });

  it('has exactly one captain', () => {
    const captains = SQUAD.starters.filter(p => p.capt);
    expect(captains).toHaveLength(1);
  });

  it('has exactly one vice captain', () => {
    const vices = SQUAD.starters.filter(p => p.vice);
    expect(vices).toHaveLength(1);
  });

  it('every player has required fields', () => {
    const all = [...SQUAD.starters, ...SQUAD.bench];
    all.forEach(p => {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(['GKP', 'DEF', 'MID', 'FWD']).toContain(p.pos);
      expect(p.club).toBeTruthy();
      expect(typeof p.p).toBe('number');
    });
  });
});

describe('TOP_PICKS', () => {
  it('has entries for all four positions', () => {
    expect(TOP_PICKS.GKP.length).toBeGreaterThan(0);
    expect(TOP_PICKS.DEF.length).toBeGreaterThan(0);
    expect(TOP_PICKS.MID.length).toBeGreaterThan(0);
    expect(TOP_PICKS.FWD.length).toBeGreaterThan(0);
  });
});

describe('CHIPS', () => {
  it('has exactly 4 chips', () => {
    expect(CHIPS).toHaveLength(4);
  });

  it('chip ids are unique', () => {
    const ids = CHIPS.map(c => c.id);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('CLUBS', () => {
  it('every club has kit, kit2, and ink colours', () => {
    Object.values(CLUBS).forEach(club => {
      expect(club.kit).toMatch(/^#/);
      expect(club.kit2).toMatch(/^#/);
      expect(club.ink).toMatch(/^#/);
    });
  });
});

describe('APEX_TEAM', () => {
  it('pitch has 4 rows (FWD, MID, DEF, GKP)', () => {
    expect(APEX_TEAM.pitch).toHaveLength(4);
  });

  it('transfer pitch has 4 rows', () => {
    expect(APEX_TEAM.transfer.pitch).toHaveLength(4);
  });

  it('transfer has 4 chips', () => {
    expect(APEX_TEAM.transfer.chips).toHaveLength(4);
  });
});

describe('TEAM_INFO', () => {
  it('has required fields', () => {
    expect(TEAM_INFO.name).toBeTruthy();
    expect(typeof TEAM_INFO.gw).toBe('number');
    expect(typeof TEAM_INFO.gwPoints).toBe('number');
    expect(typeof TEAM_INFO.totalPoints).toBe('number');
  });
});

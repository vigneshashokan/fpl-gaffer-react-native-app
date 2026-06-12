// src/__tests__/components/teamIdInput.test.tsx
import { fireEvent, render } from '@testing-library/react-native';
import { TeamIdInput } from '@/components/connect-team/TeamIdInput';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('<TeamIdInput />', () => {
  it('strips non-digits and emits the digits-only value', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TeamIdInput value="" onChange={onChange} onHelpPress={() => {}} testID="tid" />,
    );
    fireEvent.changeText(getByTestId('tid'), 'a1b 2c3 d4e5');
    expect(onChange).toHaveBeenCalledWith('12345');
  });

  it('shows the formatted value when controlled with digits', () => {
    const { getByTestId } = render(
      <TeamIdInput value="1234567" onChange={() => {}} onHelpPress={() => {}} testID="tid" />,
    );
    expect(getByTestId('tid').props.value).toBe('1 234 567');
  });

  it('renders the error message when provided', () => {
    const { getByText } = render(
      <TeamIdInput
        value="999"
        onChange={() => {}}
        onHelpPress={() => {}}
        error="We couldn't find a team with that ID."
      />,
    );
    expect(getByText("We couldn't find a team with that ID.")).toBeTruthy();
  });

  it('fires onHelpPress when the help link is tapped', () => {
    const onHelpPress = jest.fn();
    const { getByText } = render(
      <TeamIdInput value="" onChange={() => {}} onHelpPress={onHelpPress} />,
    );
    fireEvent.press(getByText('Where do I find my team ID?'));
    expect(onHelpPress).toHaveBeenCalled();
  });

  it('caps input length at 10 digits', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TeamIdInput value="" onChange={onChange} onHelpPress={() => {}} testID="tid" />,
    );
    fireEvent.changeText(getByTestId('tid'), '12345678901234');
    expect(onChange).toHaveBeenCalledWith('1234567890');
  });
});

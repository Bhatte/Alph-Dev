import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  useRef,
  useMemo,
  useEffect,
  isEnterKey,
  isUpKey,
  isDownKey,
  isNumberKey,
  Separator,
  ValidationError,
  makeTheme,
  type Theme,
  type Status,
} from '@inquirer/core';
import type { PartialDeep } from '@inquirer/type';
const colors = require('yoctocolors-cjs');
import figures from '@inquirer/figures';
// Use literal ANSI escape for cursor hide to avoid ESM import of 'ansi-escapes'
const CURSOR_HIDE = '\u001B[?25l';

type AgentSelectorTheme = {
  icon: { 
    cursor: string;
    selected: string;
    unselected: string;
  };
  style: {
    disabled: (text: string) => string;
    description: (text: string) => string;
    selected: (text: string) => string;
    unselected: (text: string) => string;
  };
  helpMode: 'always' | 'never' | 'auto';
  indexMode: 'hidden' | 'number';
};

const agentSelectorTheme: AgentSelectorTheme = {
  icon: { 
    cursor: figures.pointer,
    selected: figures.radioOn,
    unselected: figures.radioOff
  },
  style: {
    disabled: (text: string) => (colors as any).dim(`- ${text}`),
    description: (text: string) => colors.cyan(text),
    selected: (text: string) => colors.green(text),
    unselected: (text: string) => colors.white(text),
  },
  helpMode: 'auto',
  indexMode: 'number',
};

type Choice<Value> = {
  value: Value;
  name?: string;
  description?: string;
  short?: string;
  disabled?: boolean | string;
  type?: never;
};

type NormalizedChoice<Value> = {
  value: Value;
  name: string;
  description: string | undefined;
  short: string;
  disabled: boolean | string;
};

type AgentSelectorConfig<
  Value,
  ChoicesObject =
    | ReadonlyArray<string | Separator>
    | ReadonlyArray<Choice<Value> | Separator>,
> = {
  message: string;
  choices: ChoicesObject extends ReadonlyArray<string | Separator>
    ? ChoicesObject
    : ReadonlyArray<Choice<Value> | Separator>;
  pageSize?: number;
  loop?: boolean;
  default?: unknown;
  theme?: PartialDeep<Theme<AgentSelectorTheme>>;
};

function isSelectable<Value>(
  item: NormalizedChoice<Value> | Separator,
): item is NormalizedChoice<Value> {
  return !Separator.isSeparator(item) && !item.disabled;
}

function normalizeChoices<Value>(
  choices: ReadonlyArray<string | Separator> | ReadonlyArray<Choice<Value> | Separator>,
): Array<NormalizedChoice<Value> | Separator> {
  return choices.map((choice) => {
    if (Separator.isSeparator(choice)) return choice;

    if (typeof choice === 'string') {
      return {
        value: choice as Value,
        name: choice,
        short: choice,
        disabled: false,
        description: undefined,
      };
    }

    const name = choice.name ?? String(choice.value);
    const normalizedChoice: NormalizedChoice<Value> = {
      value: choice.value,
      name,
      short: choice.short ?? name,
      disabled: choice.disabled ?? false,
      description: choice.description !== undefined ? choice.description : undefined,
    };

    return normalizedChoice;
  });
}

export default createPrompt(
  <Value>(config: AgentSelectorConfig<Value>, done: (value: Value) => void) => {
    const { loop = true, pageSize = 7 } = config;
    const firstRender = useRef(true);
    const theme = makeTheme<AgentSelectorTheme>(agentSelectorTheme, config.theme);
    const [status, setStatus] = useState<Status>('idle');
    const prefix = usePrefix({ status, theme });
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

    const items = useMemo(() => normalizeChoices(config.choices), [config.choices]);

    const bounds = useMemo(() => {
      const first = items.findIndex(isSelectable);
      // Manual implementation of findLastIndex since it's not available in current ES target
      let last = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item && isSelectable(item)) {
          last = i;
          break;
        }
      }

      if (first === -1) {
        throw new ValidationError(
          '[agent selector] No selectable choices. All choices are disabled.',
        );
      }

      return { first, last };
    }, [items]);

    const defaultItemIndex = useMemo(() => {
      if (!('default' in config)) return -1;
      return items.findIndex(
        (item) => isSelectable(item) && item.value === config.default,
      );
    }, [config.default, items]);

    const [active, setActive] = useState(
      defaultItemIndex === -1 ? bounds.first : defaultItemIndex,
    );

    // Safe to assume the cursor position always point to a Choice.
    const selectedChoice = items[active] as NormalizedChoice<Value>;

    useKeypress((key, rl) => {
      clearTimeout(searchTimeoutRef.current);

      if (isEnterKey(key)) {
        setStatus('done');
        done(selectedChoice.value);
      } else if (isUpKey(key) || isDownKey(key)) {
        rl.clearLine(0);
        if (
          loop ||
          (isUpKey(key) && active !== bounds.first) ||
          (isDownKey(key) && active !== bounds.last)
        ) {
          const offset = isUpKey(key) ? -1 : 1;
          let next = active;
          do {
            next = (next + offset + items.length) % items.length;
          } while (!isSelectable(items[next]!));
          setActive(next);
        }
      } else if (isNumberKey(key)) {
        const selectedIndex = Number(key.name);
        
        // Find the nth item (ignoring separators)
        let selectableIndex = 0;
        const position = items.findIndex((item) => {
          if (Separator.isSeparator(item) || !isSelectable(item)) return false;
          
          const isMatch = selectableIndex === selectedIndex - 1;
          selectableIndex++;
          return isMatch;
        });

        const item = items[position];
        if (item != null && isSelectable(item)) {
          setActive(position);
        }

        searchTimeoutRef.current = setTimeout(() => {
          rl.clearLine(0);
        }, 700);
      }
    });

    useEffect(
      () => () => {
        clearTimeout(searchTimeoutRef.current);
      },
      [],
    );

    const message = theme.style.message(config.message, status);

    let helpTipTop = '';
    const helpTipBottom = '';
    if (
      theme.helpMode === 'always' ||
      (theme.helpMode === 'auto' && firstRender.current)
    ) {
      firstRender.current = false;

      helpTipTop = theme.style.help(
        `(Use arrow keys or number keys to navigate, Enter to select)`
      );
    }

    let separatorCount = 0;
    const page = usePagination({
      items,
      active,
      renderItem({ item, isActive, index }) {
        if (Separator.isSeparator(item)) {
          separatorCount++;
          return ` ${item.separator}`;
        }

        const indexLabel =
          theme.indexMode === 'number' ? `${index + 1 - separatorCount}. ` : '';
        
        if (item.disabled) {
          const disabledLabel =
            typeof item.disabled === 'string' ? item.disabled : '(disabled)';
          return theme.style.disabled(`${indexLabel}${item.name} ${disabledLabel}`);
        }

        const color = isActive ? theme.style.highlight : (x: string) => x;
        const cursor = isActive ? theme.icon.cursor : ` `;
        const selectedIcon = theme.icon.selected;
        const unselectedIcon = theme.icon.unselected;
        
        // For agent selector, we show a radio button to indicate selection
        const icon = isActive ? selectedIcon : unselectedIcon;
        
        return color(`${cursor} ${icon} ${indexLabel}${item.name}`);
      },
      pageSize,
      loop,
    });

    if (status === 'done') {
      return `${prefix} ${message} ${theme.style.answer(selectedChoice.short)}`;
    }

    const choiceDescription = selectedChoice.description
      ? `\n${theme.style.description(selectedChoice.description)}`
      : ``;

    return `${[prefix, message, helpTipTop].filter(Boolean).join(' ')}\n${page}${helpTipBottom}${choiceDescription}${CURSOR_HIDE}`;
  },
);

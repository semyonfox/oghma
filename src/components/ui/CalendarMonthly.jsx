import {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ClockIcon,
    EllipsisHorizontalIcon,
} from '@heroicons/react/20/solid'
import {Menu, MenuButton, MenuItem, MenuItems} from '@headlessui/react'

const events = [
    {id: 1, name: 'Maple syrup museum', time: '3PM', datetime: '2022-01-15T09:00', href: '#'},
    {id: 2, name: 'Hockey game', time: '7PM', datetime: '2022-01-22T19:00', href: '#'},
]
const days = [
    {date: '2021-12-27', events: []},
    {date: '2021-12-28', events: []},
    {date: '2021-12-29', events: []},
    {date: '2021-12-30', events: []},
    {date: '2021-12-31', events: []},
    {date: '2022-01-01', isCurrentMonth: true, events: []},
    {date: '2022-01-02', isCurrentMonth: true, events: []},
    {
        date: '2022-01-03',
        isCurrentMonth: true,
        events: [
            {id: 1, name: 'Design review', time: '10AM', datetime: '2022-01-03T10:00', href: '#'},
            {id: 2, name: 'Sales meeting', time: '2PM', datetime: '2022-01-03T14:00', href: '#'},
        ],
    },
    {date: '2022-01-04', isCurrentMonth: true, events: []},
    {date: '2022-01-05', isCurrentMonth: true, events: []},
    {date: '2022-01-06', isCurrentMonth: true, events: []},
    {
        date: '2022-01-07',
        isCurrentMonth: true,
        events: [{id: 3, name: 'Date night', time: '6PM', datetime: '2022-01-08T18:00', href: '#'}],
    },
    {date: '2022-01-08', isCurrentMonth: true, events: []},
    {date: '2022-01-09', isCurrentMonth: true, events: []},
    {date: '2022-01-10', isCurrentMonth: true, events: []},
    {date: '2022-01-11', isCurrentMonth: true, events: []},
    {
        date: '2022-01-12',
        isCurrentMonth: true,
        isToday: true,
        events: [{id: 6, name: "Sam's birthday party", time: '2PM', datetime: '2022-01-25T14:00', href: '#'}],
    },
    {date: '2022-01-13', isCurrentMonth: true, events: []},
    {date: '2022-01-14', isCurrentMonth: true, events: []},
    {date: '2022-01-15', isCurrentMonth: true, events: []},
    {date: '2022-01-16', isCurrentMonth: true, events: []},
    {date: '2022-01-17', isCurrentMonth: true, events: []},
    {date: '2022-01-18', isCurrentMonth: true, events: []},
    {date: '2022-01-19', isCurrentMonth: true, events: []},
    {date: '2022-01-20', isCurrentMonth: true, events: []},
    {date: '2022-01-21', isCurrentMonth: true, events: []},
    {
        date: '2022-01-22',
        isCurrentMonth: true,
        isSelected: true,
        events: [
            {id: 4, name: 'Maple syrup museum', time: '3PM', datetime: '2022-01-22T15:00', href: '#'},
            {id: 5, name: 'Hockey game', time: '7PM', datetime: '2022-01-22T19:00', href: '#'},
        ],
    },
    {date: '2022-01-23', isCurrentMonth: true, events: []},
    {date: '2022-01-24', isCurrentMonth: true, events: []},
    {date: '2022-01-25', isCurrentMonth: true, events: []},
    {date: '2022-01-26', isCurrentMonth: true, events: []},
    {date: '2022-01-27', isCurrentMonth: true, events: []},
    {date: '2022-01-28', isCurrentMonth: true, events: []},
    {date: '2022-01-29', isCurrentMonth: true, events: []},
    {date: '2022-01-30', isCurrentMonth: true, events: []},
    {date: '2022-01-31', isCurrentMonth: true, events: []},
    {date: '2022-02-01', events: []},
    {date: '2022-02-02', events: []},
    {date: '2022-02-03', events: []},
    {
        date: '2022-02-04',
        events: [{id: 7, name: 'Cinema with friends', time: '9PM', datetime: '2022-02-04T21:00', href: '#'}],
    },
    {date: '2022-02-05', events: []},
    {date: '2022-02-06', events: []},
]

export default function Example() {
    return (
        <div className="lg:flex lg:h-full lg:flex-col">
            <header
                className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800/50 px-6 py-4 lg:flex-none">
                <h1 className="text-base font-semibold text-neutral-900 dark:text-white">
                    <time dateTime="2022-01">January 2022</time>
                </h1>
                <div className="flex items-center">
                    <div
                        className="relative flex items-center rounded-md bg-neutral-200 dark:bg-white/10 outline -outline-offset-1 outline-neutral-300 dark:outline-white/5 md:items-stretch">
                        <button
                            type="button"
                            className="flex h-9 w-12 items-center justify-center rounded-l-md pr-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white focus:relative md:w-9 md:pr-0 md:hover:bg-neutral-300 dark:md:hover:bg-white/10"
                        >
                            <span className="sr-only">Previous month</span>
                            <ChevronLeftIcon aria-hidden="true" className="size-5"/>
                        </button>
                        <button
                            type="button"
                            className="hidden px-3.5 text-sm font-semibold text-neutral-900 dark:text-white hover:bg-neutral-300 dark:hover:bg-white/10 focus:relative md:block"
                        >
                            Today
                        </button>
                        <span className="relative -mx-px h-5 w-px bg-neutral-300 dark:bg-white/10 md:hidden"/>
                        <button
                            type="button"
                            className="flex h-9 w-12 items-center justify-center rounded-r-md pl-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white focus:relative md:w-9 md:pl-0 md:hover:bg-neutral-300 dark:md:hover:bg-white/10"
                        >
                            <span className="sr-only">Next month</span>
                            <ChevronRightIcon aria-hidden="true" className="size-5"/>
                        </button>
                    </div>
                    <div className="hidden md:ml-4 md:flex md:items-center">
                        <Menu as="div" className="relative">
                            <MenuButton
                                type="button"
                                className="flex items-center gap-x-1.5 rounded-md bg-neutral-200 dark:bg-white/10 px-3 py-2 text-sm font-semibold text-neutral-900 dark:text-white inset-ring inset-ring-neutral-300 dark:inset-ring-white/5 hover:bg-neutral-300 dark:hover:bg-white/20"
                            >
                                Month view
                                <ChevronDownIcon aria-hidden="true" className="-mr-1 size-5 text-neutral-500"/>
                            </MenuButton>

                            <MenuItems
                                transition
                                className="absolute right-0 z-10 mt-3 w-36 origin-top-right overflow-hidden rounded-md bg-white dark:bg-neutral-800 shadow-lg outline-1 -outline-offset-1 outline-neutral-200 dark:outline-white/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                            >
                                <div className="py-1">
                                    <MenuItem>
                                        <a
                                            href="#"
                                            className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                        >
                                            Day view
                                        </a>
                                    </MenuItem>
                                    <MenuItem>
                                        <a
                                            href="#"
                                            className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                        >
                                            Week view
                                        </a>
                                    </MenuItem>
                                    <MenuItem>
                                        <a
                                            href="#"
                                            className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                        >
                                            Month view
                                        </a>
                                    </MenuItem>
                                    <MenuItem>
                                        <a
                                            href="#"
                                            className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                        >
                                            Year view
                                        </a>
                                    </MenuItem>
                                </div>
                            </MenuItems>
                        </Menu>
                        <div className="ml-6 h-6 w-px bg-neutral-300 dark:bg-white/10"/>
                        <button
                            type="button"
                            className="ml-6 rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:bg-primary-500 dark:hover:bg-primary-400"
                        >
                            Add event
                        </button>
                    </div>
                    <Menu as="div" className="relative ml-6 md:hidden">
                        <MenuButton
                            className="-mx-2 flex items-center rounded-full border border-transparent p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                            <span className="sr-only">Open menu</span>
                            <EllipsisHorizontalIcon aria-hidden="true" className="size-5"/>
                        </MenuButton>

                        <MenuItems
                            transition
                            className="absolute right-0 z-10 mt-3 w-36 origin-top-right divide-y divide-neutral-200 dark:divide-white/10 overflow-hidden rounded-md bg-white dark:bg-neutral-800 shadow-lg outline-1 -outline-offset-1 outline-neutral-200 dark:outline-white/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                        >
                            <div className="py-1">
                                <MenuItem>
                                    <a
                                        href="#"
                                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                    >
                                        Create event
                                    </a>
                                </MenuItem>
                            </div>
                            <div className="py-1">
                                <MenuItem>
                                    <a
                                        href="#"
                                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                    >
                                        Go to today
                                    </a>
                                </MenuItem>
                            </div>
                            <div className="py-1">
                                <MenuItem>
                                    <a
                                        href="#"
                                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                    >
                                        Day view
                                    </a>
                                </MenuItem>
                                <MenuItem>
                                    <a
                                        href="#"
                                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                    >
                                        Week view
                                    </a>
                                </MenuItem>
                                <MenuItem>
                                    <a
                                        href="#"
                                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                    >
                                        Month view
                                    </a>
                                </MenuItem>
                                <MenuItem>
                                    <a
                                        href="#"
                                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 data-focus:bg-neutral-100 dark:data-focus:bg-white/5 data-focus:text-neutral-900 dark:data-focus:text-white data-focus:outline-hidden"
                                    >
                                        Year view
                                    </a>
                                </MenuItem>
                            </div>
                        </MenuItems>
                    </Menu>
                </div>
            </header>
            <div className="ring-1 ring-neutral-200 dark:ring-white/5 lg:flex lg:flex-auto lg:flex-col">
                <div
                    className="grid grid-cols-7 gap-px border-b border-neutral-200 dark:border-white/5 bg-neutral-200 dark:bg-white/15 text-center text-xs/6 font-semibold text-neutral-700 dark:text-neutral-300 lg:flex-none">
                    <div className="flex justify-center bg-white dark:bg-neutral-900 py-2">
                        <span>M</span>
                        <span className="sr-only sm:not-sr-only">on</span>
                    </div>
                    <div className="flex justify-center bg-white dark:bg-neutral-900 py-2">
                        <span>T</span>
                        <span className="sr-only sm:not-sr-only">ue</span>
                    </div>
                    <div className="flex justify-center bg-white dark:bg-neutral-900 py-2">
                        <span>W</span>
                        <span className="sr-only sm:not-sr-only">ed</span>
                    </div>
                    <div className="flex justify-center bg-white dark:bg-neutral-900 py-2">
                        <span>T</span>
                        <span className="sr-only sm:not-sr-only">hu</span>
                    </div>
                    <div className="flex justify-center bg-white dark:bg-neutral-900 py-2">
                        <span>F</span>
                        <span className="sr-only sm:not-sr-only">ri</span>
                    </div>
                    <div className="flex justify-center bg-white dark:bg-neutral-900 py-2">
                        <span>S</span>
                        <span className="sr-only sm:not-sr-only">at</span>
                    </div>
                    <div className="flex justify-center bg-white dark:bg-neutral-900 py-2">
                        <span>S</span>
                        <span className="sr-only sm:not-sr-only">un</span>
                    </div>
                </div>
                <div className="flex bg-neutral-100 dark:bg-white/10 text-xs/6 text-neutral-700 dark:text-neutral-300 lg:flex-auto">
                    <div className="hidden w-full lg:grid lg:grid-cols-7 lg:grid-rows-6 lg:gap-px">
                        {days.map((day) => (
                            <div
                                key={day.date}
                                data-is-today={day.isToday ? '' : undefined}
                                data-is-current-month={day.isCurrentMonth ? '' : undefined}
                                className="group relative bg-white dark:bg-neutral-900 px-3 py-2 text-neutral-600 dark:text-neutral-400 not-data-is-current-month:before:pointer-events-none not-data-is-current-month:before:absolute not-data-is-current-month:before:inset-0 not-data-is-current-month:before:bg-neutral-100 dark:not-data-is-current-month:before:bg-neutral-800/50 data-is-current-month:bg-white dark:data-is-current-month:bg-neutral-900"
                            >
                                <time
                                    dateTime={day.date}
                                    className="relative group-not-data-is-current-month:opacity-75 in-data-is-today:flex in-data-is-today:size-6 in-data-is-today:items-center in-data-is-today:justify-center in-data-is-today:rounded-full in-data-is-today:bg-primary-600 dark:in-data-is-today:bg-primary-500 in-data-is-today:font-semibold in-data-is-today:text-white"
                                >
                                    {day.date.split('-').pop().replace(/^0/, '')}
                                </time>
                                {day.events.length > 0 ? (
                                    <ol className="mt-2">
                                        {day.events.slice(0, 2).map((event) => (
                                            <li key={event.id}>
                                                <a href={event.href} className="group flex">
                                                    <p className="flex-auto truncate font-medium text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
                                                        {event.name}
                                                    </p>
                                                    <time
                                                        dateTime={event.datetime}
                                                        className="ml-3 hidden flex-none text-neutral-600 dark:text-neutral-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 xl:block"
                                                    >
                                                        {event.time}
                                                    </time>
                                                </a>
                                            </li>
                                        ))}
                                        {day.events.length > 2 ?
                                            <li className="text-neutral-600 dark:text-neutral-400">+ {day.events.length - 2} more</li> : null}
                                    </ol>
                                ) : null}
                            </div>
                        ))}
                    </div>
                    <div className="isolate grid w-full grid-cols-7 grid-rows-6 gap-px lg:hidden">
                        {days.map((day) => (
                            <button
                                key={day.date}
                                type="button"
                                data-is-today={day.isToday ? '' : undefined}
                                data-is-selected={day.isSelected ? '' : undefined}
                                data-is-current-month={day.isCurrentMonth ? '' : undefined}
                                className="group relative flex h-14 flex-col px-3 py-2 not-data-is-current-month:bg-neutral-50 dark:not-data-is-current-month:bg-neutral-900 not-data-is-selected:not-data-is-current-month:not-data-is-today:text-neutral-600 dark:not-data-is-selected:not-data-is-current-month:not-data-is-today:text-neutral-400 not-data-is-current-month:before:pointer-events-none not-data-is-current-month:before:absolute not-data-is-current-month:before:inset-0 not-data-is-current-month:before:bg-neutral-100 dark:not-data-is-current-month:before:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-900/50 focus:z-10 data-is-current-month:bg-white dark:data-is-current-month:bg-neutral-900 not-data-is-selected:data-is-current-month:not-data-is-today:text-neutral-900 dark:not-data-is-selected:data-is-current-month:not-data-is-today:text-white data-is-current-month:hover:bg-neutral-100 dark:data-is-current-month:hover:bg-neutral-900/50 data-is-selected:font-semibold data-is-selected:text-neutral-900 dark:data-is-selected:text-white data-is-today:font-semibold not-data-is-selected:data-is-today:text-primary-600 dark:not-data-is-selected:data-is-today:text-primary-400"
                            >
                                <time
                                    dateTime={day.date}
                                    className="ml-auto group-not-data-is-current-month:opacity-75 in-data-is-selected:flex in-data-is-selected:size-6 in-data-is-selected:items-center in-data-is-selected:justify-center in-data-is-selected:rounded-full in-data-is-selected:not-in-data-is-today:bg-neutral-900 dark:in-data-is-selected:not-in-data-is-today:bg-white in-data-is-selected:not-in-data-is-today:text-white dark:in-data-is-selected:not-in-data-is-today:text-neutral-900 in-data-is-selected:in-data-is-today:bg-primary-600 dark:in-data-is-selected:in-data-is-today:bg-primary-500"
                                >
                                    {day.date.split('-').pop().replace(/^0/, '')}
                                </time>
                                <span className="sr-only">{day.events.length} events</span>
                                {day.events.length > 0 ? (
                                    <span className="-mx-0.5 mt-auto flex flex-wrap-reverse">
                    {day.events.map((event) => (
                        <span key={event.id} className="mx-0.5 mb-1 size-1.5 rounded-full bg-neutral-500"/>
                    ))}
                  </span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div
                className="relative px-4 py-10 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-neutral-200 dark:after:bg-white/10 sm:px-6 lg:hidden">
                <ol className="divide-y divide-neutral-200 dark:divide-white/10 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800/50 text-sm outline-1 -outline-offset-1 outline-neutral-200 dark:outline-white/10">
                    {events.map((event) => (
                        <li key={event.id} className="group flex p-4 pr-6 focus-within:bg-neutral-200 dark:focus-within:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/5">
                            <div className="flex-auto">
                                <p className="font-semibold text-neutral-900 dark:text-white">{event.name}</p>
                                <time dateTime={event.datetime} className="mt-2 flex items-center text-neutral-700 dark:text-neutral-300">
                                    <ClockIcon aria-hidden="true" className="mr-2 size-5 text-neutral-500"/>
                                    {event.time}
                                </time>
                            </div>
                            <a
                                href={event.href}
                                className="ml-6 flex-none self-center rounded-md bg-neutral-200 dark:bg-white/10 px-3 py-2 font-semibold text-neutral-900 dark:text-white opacity-0 ring-1 ring-neutral-300 dark:ring-white/5 ring-inset group-hover:opacity-100 hover:bg-neutral-300 dark:hover:bg-white/20 focus:opacity-100"
                            >
                                Edit<span className="sr-only">, {event.name}</span>
                            </a>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    )
}

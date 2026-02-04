import LandingPage from "../pages/LandingPage";
import CalendarMonthly from "../components/ui/CalendarMonthly";

export default function Home() {
    return (
        <> {/* this is a fragment. one tag per return so this can be used to enforce it without cluttering ui with divs */}
            <LandingPage/>
            <CalendarMonthly/>
        </>
    )
}

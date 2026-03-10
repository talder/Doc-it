"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, FilePlus, PenLine, Users, BarChart3, Quote } from "lucide-react";
import DashboardView from "./dashboard/DashboardView";

interface RecentDoc {
  name: string;
  category: string;
  action: "created" | "updated";
  actor: string;
  timestamp: string;
}

interface SpaceStats {
  totalCreates: number;
  totalUpdates: number;
  uniqueEditors: number;
}

interface SpaceHomeProps {
  spaceSlug: string;
  spaceName: string;
  isAdmin?: boolean;
  onOpenDoc: (name: string, category: string) => void;
}

/* 100 curated quotes — source: dummyjson.com/quotes */
const QUOTES = [
  { text: "Your heart is the size of an ocean. Go find yourself in its hidden depths.", author: "Rumi" },
  { text: "The Bay of Bengal is hit frequently by cyclones. The months of November and May, in particular, are dangerous in this regard.", author: "Abdul Kalam" },
  { text: "Thinking is the capital, Enterprise is the way, Hard Work is the solution.", author: "Abdul Kalam" },
  { text: "If You Can't Make It Good, At Least Make It Look Good.", author: "Bill Gates" },
  { text: "Heart be brave. If you cannot be brave, just go. Love's glory is not a small thing.", author: "Rumi" },
  { text: "It is bad for a young man to sin; but it is worse for an old man to sin.", author: "Abu Bakr (R.A)" },
  { text: "If You Are Out To Describe The Truth, Leave Elegance To The Tailor.", author: "Albert Einstein" },
  { text: "O man you are busy working for the world, and the world is busy trying to turn you out.", author: "Abu Bakr (R.A)" },
  { text: "While children are struggling to be unique, the world around them is trying all means to make them look like everybody else.", author: "Abdul Kalam" },
  { text: "These Capitalists Generally Act Harmoniously And In Concert, To Fleece The People.", author: "Abraham Lincoln" },
  { text: "I Don't Believe In Failure. It Is Not Failure If You Enjoyed The Process.", author: "Oprah Winfrey" },
  { text: "Do not get elated at any victory, for all such victory is subject to the will of God.", author: "Abu Bakr (R.A)" },
  { text: "Wear gratitude like a cloak and it will feed every corner of your life.", author: "Rumi" },
  { text: "If you even dream of beating me you'd better wake up and apologize.", author: "Muhammad Ali" },
  { text: "I Will Praise Any Man That Will Praise Me.", author: "William Shakespeare" },
  { text: "One Of The Greatest Diseases Is To Be Nobody To Anybody.", author: "Mother Teresa" },
  { text: "I'm so fast that last night I turned off the light switch in my hotel room and was in bed before the room was dark.", author: "Muhammad Ali" },
  { text: "People Must Learn To Hate And If They Can Learn To Hate, They Can Be Taught To Love.", author: "Nelson Mandela" },
  { text: "Everyone has been made for some particular work, and the desire for that work has been put in every heart.", author: "Rumi" },
  { text: "The less of the World, the freer you live.", author: "Umar ibn Al-Khattāb (R.A)" },
  { text: "Respond to every call that excites your spirit.", author: "Rumi" },
  { text: "The Way To Get Started Is To Quit Talking And Begin Doing.", author: "Walt Disney" },
  { text: "God Doesn't Require Us To Succeed, He Only Requires That You Try.", author: "Mother Teresa" },
  { text: "Speak any language, Turkish, Greek, Persian, Arabic, but always speak with love.", author: "Rumi" },
  { text: "Happiness comes towards those which believe in him.", author: "Ali ibn Abi Talib (R.A)" },
  { text: "Knowledge is of two kinds: that which is absorbed and that which is heard. And that which is heard does not profit if it is not absorbed.", author: "Ali ibn Abi Talib (R.A)" },
  { text: "When I am silent, I have thunder hidden inside.", author: "Rumi" },
  { text: "Technological Progress Is Like An Axe In The Hands Of A Pathological Criminal.", author: "Albert Einstein" },
  { text: "No One Would Choose A Friendless Existence On Condition Of Having All The Other Things In The World.", author: "Aristotle" },
  { text: "Life is a gamble. You can get hurt, but people die in plane crashes, lose their arms and legs in car accidents; people die every day. Same with fighters: some die, some get hurt, some go on. You just don't let yourself believe it will happen to you.", author: "Muhammad Ali" },
  { text: "The End Of Life Is To Be Like God, And The Soul Following God Will Be Like Him.", author: "Socrates" },
  { text: "Let us sacrifice our today so that our children can have a better tomorrow.", author: "Abdul Kalam" },
  { text: "Your task is not to seek for love, but merely to seek and find all the barriers within yourself that you have built against it.", author: "Rumi" },
  { text: "In every religion there is love, yet love has no religion.", author: "Rumi" },
  { text: "Everything in the universe is within you. Ask all from yourself.", author: "Rumi" },
  { text: "I'm not a handsome guy, but I can give my hand to someone who needs help. Beauty is in the heart, not in the face.", author: "Abdul Kalam" },
  { text: "What Do I Wear In Bed? Why, Chanel No. 5, Of Course.", author: "Marilyn Monroe" },
  { text: "A Good Head And A Good Heart Are Always A Formidable Combination.", author: "Nelson Mandela" },
  { text: "The Soul Never Thinks Without A Picture.", author: "Aristotle" },
  { text: "In your light I learn how to love. In your beauty, how to make poems. You dance inside my chest where no-one sees you, but sometimes I do, and that sight becomes this art.", author: "Rumi" },
  { text: "Let the beauty we love be what we do. There are hundreds of ways to kneel and kiss the ground.", author: "Rumi" },
  { text: "If You Like Your Brother And He's Prospering, You'll Be Pleased For Him.", author: "Hamad Bin Isa Al Khalifa" },
  { text: "Success Is Dependent Upon The Glands - Sweat Glands.", author: "Zig Ziglar" },
  { text: "Champions are not generated from the championship. Champion is generated from something they have in them, desires, dreams, and visions.", author: "Muhammad Ali" },
  { text: "No matter what is the environment around you, it is always possible to maintain your brand of integrity.", author: "Abdul Kalam" },
  { text: "Applause Waits On Success.", author: "Benjamin Franklin" },
  { text: "Just As Courage Imperils Life, Fear Protects It.", author: "Leonardo Da Vinci" },
  { text: "It's Better To Be A Lion For A Day Than A Sheep All Your Life.", author: "Elizabeth Kenny" },
  { text: "The Devil's Voice Is Sweet To Hear.", author: "Stephen King" },
  { text: "Sometimes the people with the worst past, create the best future.", author: "Umar ibn Al-Khattāb (R.A)" },
  { text: "Every day, nay every moment, try to do some good deed.", author: "Abu Bakr (R.A)" },
  { text: "No Matter What People Tell You, Words And Ideas Can Change The World.", author: "Robin Williams" },
  { text: "Champions have to have the skill and the will. But the will must be stronger than the skill.", author: "Muhammad Ali" },
  { text: "Men Occasionally Stumble Over The Truth, But Most Of Them Pick Themselves Up And Hurry Off As If Nothing Had Happened.", author: "Winston Churchill" },
  { text: "Goodbyes are only for those who love with their eyes. Because for those who love with heart and soul there is no such thing as separation.", author: "Rumi" },
  { text: "The best revenge is to improve yourself.", author: "Ali ibn Abi Talib (R.A)" },
  { text: "God gave me this illness to remind me that I'm not Number One; He is.", author: "Muhammad Ali" },
  { text: "Success Is A Personal Standard, Reaching For The Highest That Is In Us, Becoming All That We Can Be.", author: "Zig Ziglar" },
  { text: "When You Have Really Exhausted An Experience You Always Reverence And Love It.", author: "Albert Camus" },
  { text: "Now you see me, now you don't. George thinks he will, but I know he won't!", author: "Muhammad Ali" },
  { text: "Elegance Does Not Consist In Putting On A New Dress.", author: "Coco Chanel" },
  { text: "It Is Always Consoling To Think Of Suicide: In That Way One Gets Through Many A Bad Night.", author: "Friedrich Nietzsche" },
  { text: "Eating Words Has Never Given Me Indigestion.", author: "Winston Churchill" },
  { text: "India has to be transformed into a developed nation, a prosperous nation and a healthy nation, with a value system.", author: "Abdul Kalam" },
  { text: "It's not bragging if you can back it up.", author: "Muhammad Ali" },
  { text: "I Wish People Would Love Everybody Else The Way They Love Me. It Would Be A Better World.", author: "Muhammad Ali" },
  { text: "Words Are Only Painted Fire; A Look Is The Fire Itself.", author: "Mark Twain" },
  { text: "Words, Without Power, Is Mere Philosophy.", author: "Muhammad Iqbal" },
  { text: "The cure for pain is in the pain.", author: "Rumi" },
  { text: "Whatever happens, just keep smiling and lose yourself in Love.", author: "Rumi" },
  { text: "Do The Right Thing. It Will Gratify Some People And Astonish The Rest.", author: "Mark Twain" },
  { text: "Only the soul knows what love is.", author: "Rumi" },
  { text: "Earning of livelihood by following some profession is better than living on charity.", author: "Umar ibn Al-Khattāb (R.A)" },
  { text: "Burdens are the foundations of ease and bitter things the forerunners of pleasure.", author: "Rumi" },
  { text: "Too Many Have Dispensed With Generosity In Order To Practice Charity.", author: "Albert Camus" },
  { text: "Even the greatest was once a beginner. Don't be afraid to take that first step.", author: "Muhammad Ali" },
  { text: "No Great Intellectual Thing Was Ever Done By Great Effort.", author: "Theodore Roosevelt" },
  { text: "To fight against one's desires is the greatest of all fights.", author: "Ali ibn Abi Talib (R.A)" },
  { text: "Innovation Distinguishes Between A Leader And A Follower.", author: "Steve Jobs" },
  { text: "We Enjoy The Process Far More Than The Proceeds.", author: "Warren Buffett" },
  { text: "When I Started Counting My Blessings, My Whole Life Turned Around.", author: "Willie Nelson" },
  { text: "This being human is a guest house. Every morning a new arrival. Welcome and entertain them all!", author: "Rumi" },
  { text: "All My Life I've Looked At Words As Though I Were Seeing Them For The First Time.", author: "Ernest Hemingway" },
  { text: "Waiting Is Painful. Forgetting Is Painful. But Not Knowing Which To Do Is The Worse Kind Of Suffering.", author: "Paulo Coelho" },
  { text: "Never Allow Someone To Be Your Priority While Allowing Yourself To Be Their Option.", author: "Mark Twain" },
  { text: "To Jaw-Jaw Is Always Better Than To War-War.", author: "Winston Churchill" },
  { text: "That's The Real Trouble With The World, Too Many People Grow Up.", author: "Walt Disney" },
  { text: "It Is Easier To Stay Out Than Get Out.", author: "Mark Twain" },
  { text: "The worst man is the one who sees himself as the best.", author: "Muhammad Ali" },
  { text: "The World Breaks Everyone, And Afterward, Some Are Strong At The Broken Places.", author: "Ernest Hemingway" },
  { text: "Rule No.1: Never Lose Money. Rule No.2: Never Forget Rule No.1.", author: "Warren Buffett" },
  { text: "Convergence of our views on global trade issues under the WTO and our common resolve to combat terrorism provide a valuable base for mutual understanding.", author: "Abdul Kalam" },
  { text: "Whenever You Find Yourself On The Side Of The Majority, It Is Time To Pause And Reflect.", author: "Mark Twain" },
  { text: "Whatever Is Done For Love Always Occurs Beyond Good And Evil.", author: "Friedrich Nietzsche" },
  { text: "Things Should Be Made As Simple As Possible, But Not Any Simpler.", author: "Albert Einstein" },
  { text: "Stop acting so small. You are the universe in ecstatic motion.", author: "Rumi" },
  { text: "All Truth Is Simple... Is That Not Doubly A Lie?", author: "Friedrich Nietzsche" },
  { text: "Money Is Only A Tool. It Will Take You Wherever You Wish, But It Will Not Replace You As The Driver.", author: "Ayn Rand" },
  { text: "The fight is won or lost far away from witnesses - behind the lines, in the gym, and out there on the road, long before I dance under those lights.", author: "Muhammad Ali" },
];

function getQuoteOfDay() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return QUOTES[dayOfYear % QUOTES.length];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SpaceHome({ spaceSlug, spaceName, isAdmin = false, onOpenDoc }: SpaceHomeProps) {
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [stats, setStats] = useState<SpaceStats | null>(null);
  const [loading, setLoading] = useState(true);
  // Resizable columns — leftPct is the left column width as a percentage
  const [leftPct, setLeftPct] = useState(35);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const quote = getQuoteOfDay();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/activity`)
      .then((r) => (r.ok ? r.json() : { recentDocs: [], stats: null }))
      .then((data) => {
        setRecentDocs(data.recentDocs || []);
        setStats(data.stats || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [spaceSlug]);

  // Drag-to-resize logic
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(20, Math.min(70, pct)));
    };
    const onUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-surface flex flex-col">
      {/* Two-column layout: stacked on mobile, side-by-side on lg+ */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex flex-col lg:flex-row"
        style={isResizing ? { userSelect: "none", cursor: "col-resize" } : undefined}
      >

        {/* Left column: header + quote + stats + recent activity */}
        <div
          className="lg:overflow-y-auto px-6 py-8 space-y-8 border-b border-border lg:border-b-0 flex-shrink-0"
          style={{ flexBasis: `${leftPct}%` }}
        >
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">
              Welcome to {spaceName}
            </h1>
            <p className="text-sm text-text-muted">
              Your documentation hub — here&apos;s what&apos;s been happening.
            </p>
          </div>

          {/* Quote of the day */}
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-5 flex gap-3 items-start">
            <Quote className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-text-primary italic">&ldquo;{quote.text}&rdquo;</p>
              <p className="text-xs text-text-muted mt-1">&mdash; {quote.author}</p>
            </div>
          </div>

          {/* Stats cards */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <FilePlus className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-text-primary">{stats.totalCreates}</p>
                  <p className="text-xs text-text-muted">Documents created</p>
                </div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-text-primary">{stats.totalUpdates}</p>
                  <p className="text-xs text-text-muted">Edits made</p>
                </div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-text-primary">{stats.uniqueEditors}</p>
                  <p className="text-xs text-text-muted">Contributors</p>
                </div>
              </div>
            </div>
          )}

          {/* Recent activity */}
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Recent Activity
            </h2>
            {loading ? (
              <p className="text-sm text-text-muted py-6 text-center">Loading…</p>
            ) : recentDocs.length === 0 ? (
              <div className="text-center py-10 text-text-muted">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No recent document activity yet.</p>
                <p className="text-xs mt-1">Create your first document to get started!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentDocs.map((doc, i) => (
                  <button
                    key={`${doc.category}/${doc.name}-${i}`}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-colors text-left group"
                    onClick={() => onOpenDoc(doc.name, doc.category)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      doc.action === "created"
                        ? "bg-green-500/10 text-green-600"
                        : "bg-blue-500/10 text-blue-600"
                    }`}>
                      {doc.action === "created" ? (
                        <FilePlus className="w-4 h-4" />
                      ) : (
                        <PenLine className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                        {doc.name}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {doc.category} · {doc.action} by {doc.actor}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        doc.action === "created"
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {doc.action}
                      </span>
                      <span className="text-xs text-text-muted">{timeAgo(doc.timestamp)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drag handle — desktop only */}
        <div
          className="hidden lg:flex w-1.5 flex-shrink-0 items-stretch cursor-col-resize group relative"
          style={{ background: "var(--color-border)" }}
          onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="m-auto w-0.5 h-8 rounded-full bg-border group-hover:bg-accent transition-colors" />
        </div>

        {/* Right column: Dashboard */}
        <div className="flex-1 min-w-0 lg:overflow-y-auto px-6 py-8">
          <DashboardView isAdmin={isAdmin} />
        </div>

      </div>
    </div>
  );
}

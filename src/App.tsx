import React, { useState } from 'react';
import {
  Briefcase,
  Code2,
  Compass,
  Globe,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Radar,
  Store as StoreIcon,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, setAuthToken } from './lib/api';
import type { User } from './types';
import { AuthScreen } from './components/AuthScreen';
import { DashboardView } from './components/DashboardView';
import { StoresView } from './components/StoresView';
import { MapExplorerView } from './components/MapExplorerView';
import { StoreDetailView } from './components/StoreDetailView';
import { RecommendationsView } from './components/RecommendationsView';
import { LeadsView } from './components/LeadsView';
import { AdminConsoleView } from './components/AdminConsoleView';
import { ProfileAndApiView } from './components/ProfileAndApiView';

type NavTab =
  | 'dashboard'
  | 'stores'
  | 'map'
  | 'recommendations'
  | 'leads'
  | 'wilayas'
  | 'scraping'
  | 'users'
  | 'profile'
  | 'api';

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Tableau de bord',
  stores: 'Répertoire des magasins',
  map: 'Carte interactive',
  recommendations: 'Matching & Recommandations',
  leads: 'Mes Leads CRM',
  wilayas: 'Gestion des 58 Wilayas',
  scraping: 'Collecte Google Maps',
  users: 'Utilisateurs & Territoires',
  profile: 'Mon Profil',
  api: 'API REST Mobile',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network failure
    }
    setAuthToken(null);
    setUser(null);
    setSelectedStoreId(null);
    setActiveTab('dashboard');
  };

  if (!user) {
    return <AuthScreen onAuthenticated={(u) => setUser(u)} />;
  }

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  }> = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'stores', label: 'Magasins', icon: StoreIcon },
    { id: 'map', label: 'Carte interactive', icon: MapPin },
    { id: 'recommendations', label: 'Recommandations', icon: Compass },
    { id: 'leads', label: 'Mes Leads CRM', icon: Briefcase },
    { id: 'wilayas', label: 'Wilayas (58)', icon: Globe, adminOnly: true },
    { id: 'scraping', label: 'Collecte Maps', icon: Radar, adminOnly: true },
    { id: 'users', label: 'Utilisateurs', icon: Users, adminOnly: true },
    { id: 'profile', label: 'Mon Profil', icon: UserIcon },
    { id: 'api', label: 'API Mobile', icon: Code2 },
  ];

  const visibleNav = navItems.filter((item) => !item.adminOnly || user.role === 'admin');

  const navigateTo = (tab: string) => {
    setSelectedStoreId(null);
    setActiveTab(tab as NavTab);
    setMobileMenuOpen(false);
  };

  const openStoreDetail = (id: number) => {
    setSelectedStoreId(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900 text-slate-300 border-r border-slate-800">
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-display font-bold text-white">
            D
          </div>
          <span className="font-display font-bold text-lg text-white tracking-tight whitespace-nowrap">
            DistribDZ
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = selectedStoreId === null && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-xs font-medium text-white truncate">{user.full_name}</div>
          <div className="text-[11px] text-slate-400 truncate">
            {user.role === 'admin' ? 'Administrateur' : user.company_name || 'Producteur'}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-xs bg-slate-900 text-slate-300 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="font-display font-bold text-lg text-white">DistribDZ</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const isActive = selectedStoreId === null && activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      isActive ? 'bg-emerald-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-200"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Déconnexion</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left — Primary Action Right */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-500 flex items-center gap-2 truncate">
              <span className="hidden sm:inline">DistribDZ</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {selectedStoreId !== null ? 'Fiche détaillée magasin' : TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigateTo(activeTab === 'map' ? 'stores' : 'map')}
              className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {activeTab === 'map' ? 'Vue Liste' : 'Carte Interactive'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {selectedStoreId !== null ? (
            <StoreDetailView
              storeId={selectedStoreId}
              user={user}
              onBack={() => setSelectedStoreId(null)}
              onDeleted={() => {
                setSelectedStoreId(null);
                setActiveTab('stores');
              }}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  user={user}
                  onSelectStore={openStoreDetail}
                  onNavigate={navigateTo}
                />
              )}
              {activeTab === 'stores' && (
                <StoresView user={user} onSelectStore={openStoreDetail} />
              )}
              {activeTab === 'map' && <MapExplorerView onSelectStore={openStoreDetail} />}
              {activeTab === 'recommendations' && (
                <RecommendationsView
                  user={user}
                  onSelectStore={openStoreDetail}
                  onOpenProfile={() => navigateTo('profile')}
                />
              )}
              {activeTab === 'leads' && (
                <LeadsView
                  onSelectStore={openStoreDetail}
                  onExploreStores={() => navigateTo('stores')}
                />
              )}
              {(activeTab === 'wilayas' ||
                activeTab === 'scraping' ||
                activeTab === 'users') &&
                user.role === 'admin' && <AdminConsoleView section={activeTab} />}
              {(activeTab === 'profile' || activeTab === 'api') && (
                <ProfileAndApiView
                  mode={activeTab}
                  user={user}
                  onUserUpdated={(updated) => setUser(updated)}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

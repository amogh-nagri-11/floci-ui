import {NavLink, Outlet, useLocation} from 'react-router-dom'
import {
    AreaChart,
    Bell,
    Cpu,
    Database,
    KeyRound,
    Boxes,
    LayoutDashboard,
    Lock,
    MessageSquare,
    Moon,
    Search,
    Shield,
    SlidersHorizontal,
    Timer,
    Sun,
    Table2,
    Users,
    Zap,
} from 'lucide-react'
import flociLogo from '@/assets/floci.png'
import {useTheme} from '@/lib/useTheme'
import {useQuery} from '@tanstack/react-query'
import {fetchHealth, SERVICE_META} from '@/api/services'

import type {ServiceName} from '@/api/types'
import {useCloudWatchIngestor} from '@/features/cloudwatch/hooks/useCloudWatchIngestor'

const ICONS: Record<ServiceName | 'dashboard', React.ElementType> = {
    dashboard: LayoutDashboard,
    cloudwatch: AreaChart,
    s3: Database,
    sqs: MessageSquare,
    dynamodb: Table2,
    sns: Bell,
    lambda: Zap,
    eks: Boxes,
    secretsmanager: KeyRound,
    cognito: Users,
    rds: Database,
    elasticache: Cpu,
    iam: Shield,
    ssm: SlidersHorizontal,
    kms: Lock,
}

function NavItem({to, icon, label}: { to: string; icon: React.ElementType; label: string }) {
    const Icon = icon
    return (
        <NavLink className="nav-link" to={to}>
            <Icon size={14}/>
            <span>{label}</span>
        </NavLink>
    )
}

const CLOUD_SERVICE_ICONS = {
    storage: Database,
    k8s: Boxes,
    queue: MessageSquare,
    function: Zap,
    database: Table2,
} satisfies Record<string, React.ElementType>

type CloudSidebarService = keyof typeof CLOUD_SERVICE_ICONS

const CLOUD_SERVICE_ITEMS: Array<{name: CloudSidebarService; label: string; route?: string}> = [
    {name: 'storage', label: 'Storage', route: 'storage'},
    {name: 'k8s', label: 'k8s Engine', route: 'k8s'},
    {name: 'database', label: 'Database', route: 'database'},
    {name: 'queue', label: 'Queue'},
    {name: 'function', label: 'Function'},
]

function CloudServiceNav() {
    const location = useLocation()
    const cloud = activeCloudFromPath(location.pathname)
    const cloudLabel = cloud.toUpperCase()

    return (
        <div className="nav-section cloud-service-nav">
            <span className="nav-label">Cloud Services · {cloudLabel}</span>
            {CLOUD_SERVICE_ITEMS.map((service) => {
                const Icon = CLOUD_SERVICE_ICONS[service.name]
                const available = service.name === 'storage' || ((service.name === 'k8s' || service.name === 'database') && cloud === 'aws')
                if (service.route && available) {
                    return <NavItem key={service.name} to={`/cloud-explorer/${cloud}/${service.route}`} icon={Icon} label={service.label}/>
                }

                return (
                    <div key={service.name} className="nav-link disabled">
                        <Icon size={14}/>
                        <span>{service.label}</span>
                        <span className="nav-soon">Soon</span>
                    </div>
                )
            })}
            {cloud === 'gcp' && (
                <div className="nav-hint">
                    <Timer size={13}/>
                    <span>GCP adapter coming soon</span>
                </div>
            )}
        </div>
    )
}

export function Layout() {
    const location = useLocation()
    const activeCloud = activeCloudFromPath(location.pathname)
    const {theme, toggle} = useTheme()
    const {data, isError} = useQuery({
        queryKey: ['health', activeCloud],
        queryFn: ({signal}) => fetchHealth(signal, activeCloud),
        refetchInterval: 5000
    })
    const status = isError ? 'unavailable' : data?.status ?? 'unknown'
    const isConnected = status === 'healthy' || status === 'degraded'
    const connectionLabel = isConnected ? 'Connected' : 'No connected'

    // Auto-ingest all Floci service activity into CloudWatch Logs
    useCloudWatchIngestor()

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">
                        <img src={flociLogo} alt="Floci" style={{width: '100%', height: '100%', objectFit: 'contain'}}/>
                    </div>
                    <div>
                        <h1>Floci</h1>
                        <p>Local Cloud</p>
                    </div>
                </div>

                <nav className="nav">
                    <div className="nav-section">
                        <span className="nav-label">General</span>
                        <NavItem to={`/console/${activeCloud}`} icon={ICONS.dashboard} label="Console Home"/>
                    </div>
                    <CloudServiceNav/>
                    <div className="nav-section">
                        <span className="nav-label">Legacy AWS Services</span>
                        {SERVICE_META.map((service) => (
                            <NavItem key={service.name} to={service.route} icon={ICONS[service.name]}
                                     label={service.displayName}/>
                        ))}
                    </div>
                </nav>

                <div className="sidebar-footer">Floci DevTools · Local</div>
            </aside>

            <div className="shell">
                <header className="topbar">
                    <div className="search">
                        <Search size={14}/>
                        <input placeholder="Search services, features, docs, and more"/>
                        <span className="kbd">/</span>
                    </div>
                    <button className="icon-btn" onClick={toggle} title="Toggle theme">
                        {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
                    </button>
                    <div className={`connection ${isConnected ? 'connected' : 'disconnected'}`}>
                        <span className={`dot ${status}`}/>
                        <span className="connection-state">{connectionLabel}</span>
                        <span className="connection-target">floci-api</span>
                    </div>
                </header>
                <main className="main">
                    <Outlet/>
                </main>
            </div>
        </div>
    )
}

function activeCloudFromPath(pathname: string): 'aws' | 'azure' | 'gcp' {
    const match = pathname.match(/^\/(?:cloud-explorer|console)\/(aws|azure|gcp)(?:\/|$)/)
    return (match?.[1] ?? 'aws') as 'aws' | 'azure' | 'gcp'
}

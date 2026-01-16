"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, AlertCircle, Sparkles, Check, Star, Crown, Package, TrendingUp, DollarSign, Calendar, CheckCircle, Users, Clock, MoreHorizontal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatAmountToZAR } from "@/lib/currency";

interface Package {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  customName?: string;
  minNights: number;
  maxNights: number;
  revenueCatId?: string;
  baseRate?: number;
  category: 'standard' | 'hosted' | 'addon' | 'special';
  multiplier: number;
  features: string[];
  entitlement?: 'standard' | 'pro';
}

interface AvailableProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'year';
  periodCount: number;
  category: 'standard' | 'hosted' | 'addon' | 'special';
  features: string[];
  entitlement?: 'standard' | 'pro';
  icon?: string;
}

interface PackageDashboardProps {
  postId: string;
}

export default function PackageDashboard({ postId }: PackageDashboardProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [availableProducts, setAvailableProducts] = useState<AvailableProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPackages = async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    
    try {
      // Load both packages and post data
      const [packagesRes, postRes] = await Promise.all([
        fetch(`/api/packages?where[post][equals]=${postId}`),
        fetch(`/api/posts/${postId}`)
      ]);

      if (!packagesRes.ok) throw new Error('Failed to load packages');
      if (!postRes.ok) throw new Error('Failed to load post data');

      const [packagesData, postData] = await Promise.all([
        packagesRes.json(),
        postRes.json()
      ]);

      const packages = packagesData.docs || [];
      const packageSettings = postData.doc?.packageSettings || [];
      
      // Create a map of package settings by package ID
      const settingsMap = new Map();
      packageSettings.forEach((setting: any) => {
        const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package;
        settingsMap.set(pkgId, setting);
      });
      
      setPackages(
        packages.map((pkg: any) => {
          const settings = settingsMap.get(pkg.id);
          const rawRevenueCatId = typeof pkg.revenueCatId === 'string' ? pkg.revenueCatId : undefined;
          const normalisedRevenueCatId =
            rawRevenueCatId && rawRevenueCatId.toLowerCase().includes('three_nights') ? '3nights' : rawRevenueCatId;
          return {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            isEnabled: settings?.enabled ?? pkg.isEnabled ?? true,
            customName: settings?.customName || pkg.name,
            minNights: pkg.minNights,
            maxNights: pkg.maxNights,
            revenueCatId: normalisedRevenueCatId,
            baseRate: pkg.baseRate,
            category: pkg.category,
            multiplier: pkg.multiplier || 1,
            features: pkg.features || [],
            entitlement: pkg.entitlement || 'standard',
          };
        })
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableProducts = async () => {
    try {
      // Fetch products from RevenueCat service via API
      const response = await fetch('/api/packages/available-products')
      if (!response.ok) {
        throw new Error('Failed to fetch available products')
      }
      
      const products = await response.json()
      setAvailableProducts(products)
      
    } catch (err: any) {
      console.error('Failed to load available products:', err)
      
      // Fallback to a minimal set if API fails
      const fallbackProducts: AvailableProduct[] = [
        {
          id: 'week_x2_customer',
          title: '🏖️ Two Week Paradise',
          description: 'Perfect for a refreshing getaway',
          price: 299.99,
          currency: 'USD',
          period: 'week',
          periodCount: 2,
          category: 'standard',
          features: ['Standard accommodation', 'Basic amenities', 'Free WiFi'],
          entitlement: 'standard',
          icon: '🏖️',
        },
        {
          id: 'per_hour_luxury',
          title: '✨ Luxury Hours',
          description: 'Premium hourly service with VIP treatment',
          price: 75.00,
          currency: 'USD',
          period: 'hour',
          periodCount: 1,
          category: 'hosted',
          features: ['Premium service', 'Enhanced amenities', 'Dedicated support', 'VIP treatment'],
          entitlement: 'pro',
          icon: '✨',
        }
      ]
      
      setAvailableProducts(fallbackProducts)
      console.warn('Using fallback products due to API error')
    }
  };

  useEffect(() => {
    loadPackages();
    loadAvailableProducts();
  }, [postId]);

  const handleToggle = (id: string) => {
    setPackages(pkgs =>
      pkgs.map(pkg =>
        pkg.id === id ? { ...pkg, isEnabled: !pkg.isEnabled } : pkg
      )
    );
  };

  const handleFieldChange = (id: string, field: keyof Package, value: any) => {
    setPackages(pkgs =>
      pkgs.map(pkg =>
        pkg.id === id ? { ...pkg, [field]: value } : pkg
      )
    );
  };

  const handleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const handleSetupProducts = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetch('/api/packages/sync-revenuecat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          postId,
          selectedProducts: Array.from(selectedProducts)
        }),
      });
      
      if (!res.ok) throw new Error('Failed to setup selected packages');
      
      const result = await res.json();
      setSuccess(`Successfully setup ${result.importedPackages?.length || 0} packages!`);
      
      // Close setup and reload packages
      setShowSetup(false);
      setSelectedProducts(new Set());
      await loadPackages();
    } catch (e: any) {
      setError(e.message || 'Failed to setup packages');
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Save each package individually
      const updatePromises = packages.map(async (pkg) => {
        // Update the package record directly
        const packageUpdateRes = await fetch(`/api/packages/${pkg.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pkg.name,
            description: pkg.description,
            multiplier: pkg.multiplier,
            category: pkg.category,
            minNights: pkg.minNights,
            maxNights: pkg.maxNights,
            baseRate: pkg.baseRate,
            isEnabled: pkg.isEnabled,
            entitlement: pkg.entitlement,
          }),
        });
        
        if (!packageUpdateRes.ok) {
          throw new Error(`Failed to update package ${pkg.name}`);
        }
        
        return packageUpdateRes.json();
      });
      
      await Promise.all(updatePromises);
      
      // Also update the post's packageSettings for custom names
      const postUpdateRes = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageSettings: packages.map(pkg => ({
            package: pkg.id,
            enabled: pkg.isEnabled,
            customName: pkg.customName,
            entitlement: pkg.entitlement,
          })),
        }),
      });
      
      if (!postUpdateRes.ok) throw new Error("Failed to save package settings");
      
      setSuccess("All package changes saved successfully!");
      
      // Refresh the data to show actual saved values
      await loadPackages();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (cents: number | undefined) => {
    if (!cents) return formatAmountToZAR(0);
    // baseRate is stored in cents, convert to Rands
    return formatAmountToZAR(cents / 100);
  };

  const calculateStats = () => {
    const totalPackages = packages.length;
    const totalRevenue = packages.reduce((acc, pkg) => acc + (pkg.baseRate || 0), 0);
    const activePackages = packages.filter((p) => p.isEnabled).length;
    const avgMinNights = packages.length > 0
      ? packages.reduce((acc, pkg) => acc + pkg.minNights, 0) / totalPackages
      : 0;
    const avgMaxNights = packages.length > 0
      ? packages.reduce((acc, pkg) => acc + pkg.maxNights, 0) / totalPackages
      : 0;
    const avgStay = Math.round((avgMinNights + avgMaxNights) / 2);
    return {
      totalPackages,
      totalRevenue,
      activePackages,
      avgStay,
    };
  };

  const stats = calculateStats();
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);

  const StatCard = ({
    title,
    value,
    icon: Icon,
    subtext,
  }: {
    title: string;
    value: string;
    icon: any;
    subtext?: string;
  }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
      </div>
      <div className="p-2 bg-slate-50 rounded-lg text-slate-600">
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center gap-2 py-10">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading packages...
    </div>
  );

  if (showSetup) {
    return (
      <div className="container py-10 max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              ✨ Package Setup
            </h1>
            <p className="text-lg text-gray-600 mt-2">Choose your magical experiences like selecting Disney movies</p>
          </div>
          <Button 
            onClick={() => setShowSetup(false)} 
            variant="outline"
          >
            Back to Dashboard
          </Button>
        </div>

        {error && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {availableProducts.map(product => (
            <Card 
              key={product.id}
              className={`cursor-pointer transition-all duration-300 hover:shadow-xl ${
                selectedProducts.has(product.id) 
                  ? 'ring-2 ring-purple-500 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50' 
                  : 'hover:shadow-md'
              }`}
              onClick={() => handleProductSelection(product.id)}
            >
              <CardHeader className="relative">
                <div className="flex justify-between items-start">
                  <div className="text-4xl mb-2">{product.icon}</div>
                  {selectedProducts.has(product.id) && (
                    <div className="absolute top-4 right-4 bg-purple-500 text-white rounded-full p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <CardTitle className="text-xl text-gray-800">
                  {product.title}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={product.entitlement === 'pro' ? 'default' : 'secondary'} className="text-xs">
                    {product.entitlement === 'pro' ? (
                      <>
                        <Crown className="h-3 w-3 mr-1" />
                        Pro
                      </>
                    ) : (
                      <>
                        <Star className="h-3 w-3 mr-1" />
                        Standard
                      </>
                    )}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {product.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm mb-3">{product.description}</p>
                <div className="text-2xl font-bold text-purple-600 mb-3">
                  ${product.price} <span className="text-sm text-gray-500">/ {product.periodCount} {product.period}{product.periodCount > 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-1">
                  {product.features.slice(0, 3).map((feature, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-600">
                      <Sparkles className="h-3 w-3 mr-2 text-purple-400" />
                      {feature}
                    </div>
                  ))}
                  {product.features.length > 3 && (
                    <div className="text-xs text-gray-400">
                      +{product.features.length - 3} more features
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center">
          <Button 
            onClick={handleSetupProducts}
            disabled={selectedProducts.size === 0 || syncing}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-3"
          >
            {syncing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Setting up magic...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Setup {selectedProducts.size} Selected Package{selectedProducts.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header Section */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Package Dashboard
            </h1>
            <p className="text-slate-500 mt-1">
              Manage your property packages and pricing tiers.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowSetup(true)}
              className="border-slate-300 shadow-sm text-slate-700 bg-white hover:bg-slate-50"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Setup New Packages
            </Button>
            {packages.length > 0 && (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </div>
        </header>

        {error && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Stats Grid */}
        {packages.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <StatCard
              title="Total Packages"
              value={stats.totalPackages.toString()}
              icon={Package}
              subtext={`${packages.length} configured`}
            />
            <StatCard
              title="Total Revenue Potential"
              value={formatCurrency(stats.totalRevenue)}
              icon={DollarSign}
              subtext="Based on base rates"
            />
            <StatCard
              title="Active Packages"
              value={stats.activePackages.toString()}
              icon={CheckCircle}
              subtext={`${stats.totalPackages > 0 ? Math.round((stats.activePackages / stats.totalPackages) * 100) : 0}% utilization`}
            />
            <StatCard
              title="Avg. Stay Duration"
              value={`${stats.avgStay} nights`}
              icon={Calendar}
              subtext="Across all tiers"
            />
          </div>
        )}

        {/* Main Content Area */}
        <div className="space-y-6">
          {packages.length > 0 && (
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                All Packages
              </h2>
            </div>
          )}

          {/* Package Grid */}
          {packages.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎬</div>
              <h3 className="text-2xl font-semibold text-gray-700 mb-2">Ready for Your First Setup?</h3>
              <p className="text-gray-500 mb-6">Create magical experiences for your guests by setting up your first packages.</p>
              <Button 
                onClick={() => setShowSetup(true)}
                size="lg"
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Start Package Setup
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full"
                >
                  {/* Card Header / Visual Anchor */}
                  <div className="h-32 bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-center relative">
                    <div className="text-4xl filter grayscale group-hover:grayscale-0 transition-all duration-300 transform group-hover:scale-110">
                      {pkg.name.split(' ')[0] || '📦'}
                    </div>
                    <div className="absolute top-4 right-4">
                      {pkg.isEnabled ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase text-slate-500 bg-slate-100 mb-2">
                          {pkg.category}
                        </span>
                        <h3 className="text-lg font-semibold text-slate-900 leading-tight group-hover:text-blue-600 transition-colors">
                          {pkg.name.substring(pkg.name.indexOf(' ') + 1) || pkg.name}
                        </h3>
                      </div>
                    </div>

                    <p className="text-sm text-slate-500 mb-4 line-clamp-2 flex-1">
                      {pkg.description || 'No description provided'}
                    </p>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm border-t border-slate-100 pt-4 mt-auto">
                      <div className="flex items-center text-slate-600">
                        <Clock className="w-4 h-4 mr-2 text-slate-400" />
                        <span>
                          {pkg.minNights}-{pkg.maxNights} nights
                        </span>
                      </div>
                      <div className="flex items-center text-slate-600">
                        <Users className="w-4 h-4 mr-2 text-slate-400" />
                        <span className="capitalize">{pkg.entitlement || 'standard'}</span>
                      </div>
                    </div>

                    {/* Footer Price */}
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-400 font-medium">Base Rate</span>
                        <span className="text-lg font-bold text-slate-900">
                          {formatCurrency(pkg.baseRate)}
                        </span>
                      </div>
                      <Dialog open={editingPackage?.id === pkg.id} onOpenChange={(open) => {
                        if (!open) setEditingPackage(null);
                        else setEditingPackage(pkg);
                      }}>
                        <DialogTrigger asChild>
                          <button
                            className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-2 rounded-full transition-colors"
                          >
                            <MoreHorizontal className="w-5 h-5" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Package</DialogTitle>
                            <DialogDescription>
                              Update package details and settings
                            </DialogDescription>
                          </DialogHeader>
                          {editingPackage && editingPackage.id === pkg.id && (
                            <div className="space-y-4">
                              <div>
                                <label className="text-sm font-medium text-gray-600">Name</label>
                                <Input
                                  value={editingPackage.name}
                                  onChange={e => setEditingPackage({ ...editingPackage, name: e.target.value })}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-600">Description</label>
                                <Textarea
                                  value={editingPackage.description || ""}
                                  onChange={e => setEditingPackage({ ...editingPackage, description: e.target.value })}
                                  className="mt-1"
                                  rows={3}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Category</label>
                                  <Select
                                    value={editingPackage.category || 'standard'}
                                    onValueChange={value => setEditingPackage({ ...editingPackage, category: value as any })}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="standard">Standard</SelectItem>
                                      <SelectItem value="hosted">Hosted</SelectItem>
                                      <SelectItem value="addon">Add-on</SelectItem>
                                      <SelectItem value="special">Special</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Entitlement</label>
                                  <Select
                                    value={editingPackage.entitlement || 'standard'}
                                    onValueChange={value => setEditingPackage({ ...editingPackage, entitlement: value as any })}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="standard">Standard</SelectItem>
                                      <SelectItem value="pro">Pro</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Min Nights</label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={editingPackage.minNights}
                                    onChange={e => setEditingPackage({ ...editingPackage, minNights: parseInt(e.target.value) || 1 })}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Max Nights</label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={editingPackage.maxNights}
                                    onChange={e => setEditingPackage({ ...editingPackage, maxNights: parseInt(e.target.value) || 7 })}
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Multiplier</label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.1"
                                    max="3.0"
                                    value={editingPackage.multiplier}
                                    onChange={e => setEditingPackage({ ...editingPackage, multiplier: parseFloat(e.target.value) || 1 })}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Base Rate (cents)</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={editingPackage.baseRate || ''}
                                    onChange={e => setEditingPackage({ ...editingPackage, baseRate: e.target.value ? parseFloat(e.target.value) : undefined })}
                                    className="mt-1"
                                    placeholder="Optional"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-600">Custom Display Name</label>
                                <Input
                                  value={editingPackage.customName || ""}
                                  onChange={e => setEditingPackage({ ...editingPackage, customName: e.target.value })}
                                  className="mt-1"
                                  placeholder="Override display name"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={editingPackage.isEnabled}
                                  onCheckedChange={checked => setEditingPackage({ ...editingPackage, isEnabled: checked })}
                                />
                                <label className="text-sm font-medium">Enabled</label>
                              </div>
                              {editingPackage.revenueCatId && (
                                <div className="text-xs text-gray-400">
                                  RevenueCat ID: {editingPackage.revenueCatId}
                                </div>
                              )}
                            </div>
                          )}
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setEditingPackage(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={async () => {
                                if (editingPackage) {
                                  handleFieldChange(editingPackage.id, 'name', editingPackage.name);
                                  handleFieldChange(editingPackage.id, 'description', editingPackage.description);
                                  handleFieldChange(editingPackage.id, 'category', editingPackage.category);
                                  handleFieldChange(editingPackage.id, 'entitlement', editingPackage.entitlement);
                                  handleFieldChange(editingPackage.id, 'minNights', editingPackage.minNights);
                                  handleFieldChange(editingPackage.id, 'maxNights', editingPackage.maxNights);
                                  handleFieldChange(editingPackage.id, 'multiplier', editingPackage.multiplier);
                                  handleFieldChange(editingPackage.id, 'baseRate', editingPackage.baseRate);
                                  handleFieldChange(editingPackage.id, 'customName', editingPackage.customName);
                                  handleFieldChange(editingPackage.id, 'isEnabled', editingPackage.isEnabled);
                                  setEditingPackage(null);
                                }
                              }}
                            >
                              Save Changes
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add New Card Placeholder */}
              <button
                onClick={() => setShowSetup(true)}
                className="group border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-slate-400 hover:bg-slate-50 transition-all duration-300 min-h-[300px]"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4 group-hover:bg-white group-hover:shadow-sm transition-all">
                  <Package className="w-6 h-6 text-slate-400 group-hover:text-slate-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-1">
                  Create New Package
                </h3>
                <p className="text-sm text-slate-500 max-w-[200px]">
                  Add a new pricing tier or special offer to your inventory.
                </p>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
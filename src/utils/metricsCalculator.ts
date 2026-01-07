export interface ProductivityMetric {
    timestamp: number;
    feature: string;
    manualTimeEstimate: number; // in minutes
    actualTime: number; // in seconds
    timeSaved: number; // in minutes
    helpful: boolean | null;
}

export interface MetricsSummary {
    totalTimeSaved: number; // in hours
    totalUsages: number;
    helpfulCount: number;
    notHelpfulCount: number;
    mostUsedFeature: string;
    featureUsageCounts: Record<string, number>;
}

export class MetricsCalculator {
    static calculateTimeSaved(manualTimeMinutes: number, actualTimeSeconds: number): number {
        const actualTimeMinutes = actualTimeSeconds / 60;
        return Math.max(0, manualTimeMinutes - actualTimeMinutes);
    }

    static calculateSummary(metrics: ProductivityMetric[]): MetricsSummary {
        if (metrics.length === 0) {
            return {
                totalTimeSaved: 0,
                totalUsages: 0,
                helpfulCount: 0,
                notHelpfulCount: 0,
                mostUsedFeature: 'N/A',
                featureUsageCounts: {}
            };
        }

        const totalTimeSavedMinutes = metrics.reduce((sum, m) => sum + m.timeSaved, 0);
        const helpfulCount = metrics.filter(m => m.helpful === true).length;
        const notHelpfulCount = metrics.filter(m => m.helpful === false).length;

        const featureUsageCounts: Record<string, number> = {};
        metrics.forEach(m => {
            featureUsageCounts[m.feature] = (featureUsageCounts[m.feature] || 0) + 1;
        });

        const mostUsedFeature = Object.entries(featureUsageCounts)
            .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

        return {
            totalTimeSaved: totalTimeSavedMinutes / 60, // Convert to hours
            totalUsages: metrics.length,
            helpfulCount,
            notHelpfulCount,
            mostUsedFeature,
            featureUsageCounts
        };
    }

    static calculateROI(metrics: ProductivityMetric[], hourlyRate: number = 120): number {
        const summary = this.calculateSummary(metrics);
        return summary.totalTimeSaved * hourlyRate;
    }

    static formatTimeSaved(minutes: number): string {
        if (minutes < 60) {
            return `${Math.round(minutes)} minutes`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        if (remainingMinutes === 0) {
            return `${hours} hour${hours > 1 ? 's' : ''}`;
        }
        return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} min`;
    }
}
